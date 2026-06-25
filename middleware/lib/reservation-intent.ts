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

/** Statuses (or events) that mean any issued code must be revoked. */
const REMOVED_STATUSES = new Set(["canceled", "cancelled", "checked_out", "no_show"]);

/**
 * Decide what a given event implies for this reservation's codes.
 *
 * Cloudbeds tracks check-in at the GUEST level (`guestStatus`); the
 * status_changed payload's top-level `status` stays "confirmed" even on
 * check-in. So we can't decide create-vs-not from the thin payload — instead any
 * `status_changed` routes to "ensure", which fetches the reservation and gates on
 * checked-in (isCheckedIn) + paid (isPaidInFull). Checkout/cancel/no-show DO
 * change the top-level status, so those (and deleted) revoke directly.
 */
export function classifyIntent(payload: ReservationWebhookPayload): "ensure" | "revoke" | "ignore" {
  const event = payload.event ?? "";
  if (event.includes("deleted")) return "revoke";

  const status = (payload.status ?? "").toLowerCase();
  if (status && REMOVED_STATUSES.has(status)) return "revoke";

  if (event.includes("status_changed")) return "ensure";

  // Bookings (created) and everything else: do nothing until a status change.
  return "ignore";
}

/**
 * True if the reservation is checked in. Primary signal is the reservation's
 * top-level status === "checked_in" (verified live for this account); guest-level
 * guestStatus is kept as a fallback in case an account reports it there instead.
 */
export function isCheckedIn(
  detail: { status?: string; guestList?: Record<string, { guestStatus?: string }> | null },
): boolean {
  if ((detail?.status ?? "").toLowerCase() === "checked_in") return true;
  const guests = detail?.guestList ? Object.values(detail.guestList) : [];
  return guests.some((g) => g?.guestStatus === "checked_in");
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
