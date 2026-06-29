import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { verifyWebhookToken } from "@/lib/webhook-auth";
import {
  classifyIntent,
  ensurePasscodes,
  revokePasscodes,
  reconcilePasscodes,
  reservationIdOf,
  propertyIdOf,
  getGraceSettings,
  isCheckout,
  type ReservationWebhookPayload,
} from "@/lib/passcode-sync";
import { prisma } from "@/lib/db";

// Prisma + TTLock (node:crypto) need the Node.js runtime, not edge.
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/cloudbeds-webhook?token=<WEBHOOK_SECRET>
 *
 * The single endpoint registered in all 8 Cloudbeds accounts. The payload is
 * thin and carries the property identity (propertyID) but NO roomID, so the
 * sync layer calls getReservation to find the assigned room(s) before touching
 * any locks. See `lib/passcode-sync.ts`.
 *
 * Auth is a secret URL token (Cloudbeds does not sign webhooks). Response
 * contract: return 2XX fast on anything we've handled or can't retry our way
 * out of (bad token aside); return 5XX only on a transient failure we want
 * Cloudbeds to retry (it retries 5× at 1-min intervals).
 */
export async function POST(req: Request) {
  // 1. Auth — reject unsigned/forged calls before doing any work.
  if (!verifyWebhookToken(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse. A malformed body is not retryable → 400, not 500.
  let payload: ReservationWebhookPayload;
  try {
    payload = (await req.json()) as ReservationWebhookPayload;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // Both payload casings: status_changed/deleted use propertyID/reservationID;
  // accommodation_* use propertyId/reservationId.
  const reservationId = reservationIdOf(payload);
  const propertyId = propertyIdOf(payload);
  if (!payload?.event || !propertyId || !reservationId) {
    return Response.json(
      { ok: false, error: "missing event/propertyID/reservationID" },
      { status: 400 },
    );
  }

  const intent = classifyIntent(payload);
  if (intent === "ignore") {
    // Acknowledge so Cloudbeds stops retrying; record that we saw it.
    await prisma.eventLog.create({
      data: {
        source: "webhook",
        event: payload.event,
        propertyId,
        action: "ignored",
        detail: { reservationId, status: payload.status ?? null },
      },
    });
    return Response.json({ ok: true, intent, handled: false });
  }

  // 3. Act. A failure here (Cloudbeds/TTLock/DB hiccup) is transient → 500 so
  //    Cloudbeds retries; the sync layer is idempotent, so a retry is safe.
  try {
    const registry = CloudbedsRegistry.fromEnv();
    let result;
    if (intent === "revoke") {
      // A real checkout earns the configured grace headroom; cancel / no-show /
      // deleted revoke immediately (no guest to give headroom to).
      const grace = isCheckout(payload) ? (await getGraceSettings()).checkoutGraceMinutes : 0;
      result = await revokePasscodes(reservationId, payload.event, grace);
    } else if (intent === "reconcile") {
      result = await reconcilePasscodes(registry, payload);
    } else {
      result = await ensurePasscodes(registry, payload);
    }

    return Response.json({ ok: true, intent, result });
  } catch (err: any) {
    await prisma.eventLog
      .create({
        data: {
          source: "webhook",
          event: payload.event,
          propertyId,
          action: "webhook_error",
          detail: { reservationId, error: err?.message ?? String(err) },
        },
      })
      .catch(() => {}); // never let logging mask the original error

    return Response.json(
      { ok: false, intent, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

/** Reject other verbs explicitly (some webhook registrations probe with GET). */
export async function GET() {
  return Response.json(
    { ok: false, error: "POST only — this is the Cloudbeds webhook receiver" },
    { status: 405 },
  );
}
