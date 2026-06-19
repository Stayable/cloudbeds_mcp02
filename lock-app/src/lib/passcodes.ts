/**
 * Pure passcode helpers. PIN generation + validity-window math, shared by the
 * guest/manual/backup Server Actions. Mirrors the middleware's generatePin /
 * validityWindow so codes minted here behave identically to webhook-minted ones.
 */
import { randomInt } from "node:crypto";

export const PIN_LENGTH = 6;
/** TTLock keyboardPwdType: 3 = period (guest/manual), 2 = permanent (staff backup). */
export const PERIOD_PWD_TYPE = 3 as const;
export const BACKUP_PWD_TYPE = 2 as const;

/** Cryptographically-uniform N-digit PIN with no leading zero (full width). */
export function generatePin(length: number = PIN_LENGTH): string {
  if (length < 4 || length > 9) throw new Error("PIN length must be 4–9 (TTLock limit)");
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max));
}

/** Guest window: UTC start-of-arrival → end-of-departure (mirrors middleware). */
export function guestValidityWindow(startDate?: string, endDate?: string): { startTs: number; endTs: number } {
  const startTs = startDate ? Date.parse(`${startDate}T00:00:00Z`) : NaN;
  const endTs = endDate ? Date.parse(`${endDate}T23:59:59Z`) : NaN;
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
    throw new Error(`Invalid reservation date range: start=${startDate} end=${endDate}`);
  }
  return { startTs, endTs };
}

/** Manual window: now → now + hours. */
export function manualValidityWindow(nowMs: number, hours: number): { startTs: number; endTs: number } {
  if (!(hours > 0)) throw new Error("manual code duration must be positive");
  return { startTs: nowMs, endTs: nowMs + Math.round(hours * 3600 * 1000) };
}
