"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";

export interface RoomSyncState {
  ran: boolean;
  created?: number;
  revoked?: number;
  error?: string;
}

// The headless middleware owns passcode mutations; the lock-app triggers its
// reconcile rather than duplicating that orchestration. Override per-env if the
// middleware moves; defaults to the known prod deployment.
const MIDDLEWARE_URL = (process.env.MIDDLEWARE_URL ?? "https://lock-middleware.vercel.app").replace(/\/$/, "");

/**
 * TESTING ONLY (until Vercel Pro lets the reconcile cron run every few minutes):
 * on-demand trigger of the middleware's poll-reconcile for ONE property, so a room
 * change a manager just flipped in Cloudbeds is picked up immediately instead of
 * waiting for the (currently daily) cron. Hits the SAME engine the cron runs —
 * /api/cron/reconcile?propertyId= — so behaviour is identical to the future auto
 * path. Sends CRON_SECRET as a bearer when configured (the endpoint is open until
 * the secret is set). Gated on lock.sync. Idempotent + safe to click repeatedly.
 */
export async function runRoomChangeSync(_prev: RoomSyncState, formData: FormData): Promise<RoomSyncState> {
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  try {
    const user = await requirePermission("lock.sync", propertyId || undefined);
    if (!propertyId) return { ran: true, error: "Missing property" };

    const url = `${MIDDLEWARE_URL}/api/cron/reconcile?propertyId=${encodeURIComponent(propertyId)}`;
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || (body as { ok?: boolean }).ok === false) {
      const err = (body as { error?: string }).error;
      return { ran: true, error: err ? String(err) : `Reconcile failed (HTTP ${res.status})` };
    }

    const created = Number((body as { created?: number }).created ?? 0);
    const revoked = Number((body as { revoked?: number }).revoked ?? 0);
    await writeAudit(user, {
      action: "room_change_resync",
      propertyId,
      detail: buildDetail({ message: `manual reconcile — ${created} created, ${revoked} revoked`, extra: { created, revoked } }),
    });
    revalidatePath(`/p/${propertyId}/dashboard`);
    return { ran: true, created, revoked };
  } catch (e: unknown) {
    return { ran: true, error: e instanceof Error ? e.message : String(e) };
  }
}
