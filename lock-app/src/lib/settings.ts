/**
 * Access-timing setting bounds. Plain (non-"use server") module so both the
 * Server Action and the Settings page can import these constants — a "use server"
 * file may only export async functions.
 *
 * Caps: checkout grace stays short (the room turns over to the next guest);
 * room-transfer grace can be longer (no turnover risk on the room being left).
 */
export const CHECKOUT_GRACE_MAX = 60;
export const TRANSFER_GRACE_MAX = 240;

/** Clamp a form value to a whole number within [min, max]; blank/NaN → min. */
export function clampGrace(v: unknown, max: number): number {
  const n = Math.round(Number(v ?? 0));
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(0, n));
}
