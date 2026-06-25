/**
 * Pure reservation-event logic — no DB/Cloudbeds imports, so it's unit-testable.
 *
 * TRIGGER POLICY (RISE8 decision): a guest door code is created ONLY when the
 * guest CHECKS IN — not at booking or confirmation. The code is revoked on
 * checkout, cancel, no-show, or reservation deletion.
 */

/** Minimal shape of a Cloudbeds reservation webhook payload (it is THIN). */
export interface ReservationWebhookPayload {
  event: string;
  propertyID: number | string;
  propertyID_str?: string;
  reservationID: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

/** The only status that should provision a code. */
const ACTIVE_STATUSES = new Set(["checked_in"]);
/** Statuses (or events) that mean any issued code must be revoked. */
const REMOVED_STATUSES = new Set(["canceled", "cancelled", "checked_out", "no_show"]);

/**
 * Decide what a given event/status implies for this reservation's codes.
 * Check-in only: confirmed/not_confirmed/created all return "ignore" so no code
 * is minted before the guest actually checks in.
 */
export function classifyIntent(payload: ReservationWebhookPayload): "ensure" | "revoke" | "ignore" {
  const event = payload.event ?? "";
  if (event.includes("deleted")) return "revoke";

  const status = (payload.status ?? "").toLowerCase();
  if (status && REMOVED_STATUSES.has(status)) return "revoke";
  if (status && ACTIVE_STATUSES.has(status)) return "ensure";

  // Booking/confirmation events do NOT create a code under the check-in policy.
  return "ignore";
}

/** Human-readable note body written onto the Cloudbeds reservation. */
export function reservationNoteBody(args: {
  pin: string;
  roomName?: string;
  startDate?: string;
  endDate?: string;
}): string {
  const parts = [`Stayable door code: ${args.pin}`];
  if (args.roomName) parts.push(`Room ${args.roomName}`);
  if (args.startDate && args.endDate) parts.push(`valid ${args.startDate} → ${args.endDate}`);
  return parts.join(" · ");
}
