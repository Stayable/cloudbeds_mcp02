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

/**
 * Whether a reservation is fully paid (balance owed is zero or a credit).
 * RISE8 rule: a guest door code is created only when checked-in AND paid in full.
 * Fails closed — an unknown/unparseable balance is treated as NOT paid, so we
 * never mint a code for a reservation whose balance we can't confirm is settled.
 */
export function isPaidInFull(balance: number | string | null | undefined): boolean {
  if (balance === null || balance === undefined || balance === "") return false;
  const n = typeof balance === "number" ? balance : Number(balance);
  if (Number.isNaN(n)) return false;
  return n <= 0;
}

/**
 * Note written onto the Cloudbeds reservation: `<lockName>-<PIN>`
 * (e.g. "LL-239-445572"), matching the devicethread-style token format.
 */
export function reservationNoteBody(args: { lockName: string; pin: string }): string {
  return `${args.lockName}-${args.pin}`;
}
