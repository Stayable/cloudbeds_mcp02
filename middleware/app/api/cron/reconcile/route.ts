import { NextResponse } from "next/server";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { reconcileCheckedInReservations, sweepExpiredPasscodes } from "@/lib/passcode-sync";
import { propertiesToReconcile } from "@/lib/reservation-intent";
import { prisma } from "@/lib/db";

// Prisma + TTLock need the Node.js runtime, not edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Poll-reconcile cron (see vercel.json). Catch-up for room changes that fire no
 * webhook we receive: for each configured property, reconcile in-house
 * reservations' PINs onto their current rooms. Sequential across properties to
 * stay under Cloudbeds' rate limit. Idempotent — a no-change run just reads.
 *
 * Guarded by CRON_SECRET when set (Vercel cron sends it as a bearer token); also
 * lets you trigger a catch-up on demand with that token.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const registry = CloudbedsRegistry.fromEnv();
  // Optional ?propertyId=<id> narrows a manual run to one property (handy for a
  // single-property test without polling all 8).
  const filter = new URL(req.url).searchParams.get("propertyId");

  // Only reconcile properties that actually have a mapped lock — a lockless
  // property has nothing to reconcile, so skip its Cloudbeds call entirely. This
  // keeps the every-few-minutes poll's API load minimal (today only Lakeland has
  // locks; it scales as properties are rolled out).
  const withLocks = new Set(
    (await prisma.lockMap.findMany({ select: { propertyId: true }, distinct: ["propertyId"] })).map((r) => r.propertyId),
  );
  const targets = propertiesToReconcile(registry.propertyIds(), withLocks, filter);

  const results: Array<{ propertyId: string; pinsCreated?: number; pinsRevoked?: number; error?: string }> = [];
  for (const propertyId of targets) {
    try {
      const r = await reconcileCheckedInReservations(registry, propertyId);
      results.push({ propertyId, pinsCreated: r.pinsCreated, pinsRevoked: r.pinsRevoked });
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ propertyId, error });
      await prisma.eventLog
        .create({ data: { source: "cron", event: "cron/reconcile", propertyId, action: "cron_reconcile_error", detail: { error } } })
        .catch(() => {});
    }
  }
  // Finalize any grace-period codes whose window has now passed (hard-delete +
  // mark revoked). Runs once per tick across all properties; cheap when none due.
  let swept = 0;
  try {
    ({ swept } = await sweepExpiredPasscodes());
  } catch { /* non-fatal — next tick retries */ }

  const created = results.reduce((n, r) => n + (r.pinsCreated ?? 0), 0);
  const revoked = results.reduce((n, r) => n + (r.pinsRevoked ?? 0), 0);
  // skipped = configured properties with no locks (or filtered out).
  const skipped = registry.propertyIds().length - targets.length;
  return NextResponse.json({ ok: true, created, revoked, swept, properties: targets.length, skipped, results });
}
