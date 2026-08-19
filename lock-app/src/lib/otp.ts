/**
 * Pure OTP helpers for email-code login. The 6-digit code replaces the magic-link
 * URL token; storage/verification orchestration lives in lib/auth.ts. Constant-time
 * compare is not required here (codes are short-lived, single-use, server-checked).
 */
import { randomInt } from "crypto";

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Normalise a typed or pasted code to bare digits. A code copied out of the
 * email can carry spaces, a dash, or a trailing newline; none of that changes
 * which code the user meant, so it must not decide whether they get in. Codes
 * are digits-only by construction (generateOtpCode), so dropping non-digits
 * cannot make two different codes collide.
 */
export function normalizeOtpInput(input: string): string {
  return input.replace(/\D/g, "");
}

export function otpMatches(
  stored: { code: string | null; used: boolean; expiresAt: Date },
  input: string,
  now: Date,
): boolean {
  if (!stored.code || stored.used) return false;
  if (stored.expiresAt < now) return false;
  return stored.code === normalizeOtpInput(input);
}

/**
 * Pick the outstanding code the user actually typed.
 *
 * A sign-in request can mint more than one code — a double-submit of "Send code"
 * sends two emails seconds apart, each with different digits. Verification must
 * therefore consider EVERY unused, unexpired code for the address, not just the
 * newest: checking only the newest rejects the other email's perfectly valid code
 * as "invalid or expired", which is exactly what a guest sees as "the first code
 * worked, the second one didn't". Returns the matching row, or null.
 */
export function pickOtpMatch<T extends { code: string | null; used: boolean; expiresAt: Date }>(
  outstanding: T[],
  input: string,
  now: Date,
): T | null {
  return outstanding.find((link) => otpMatches(link, input, now)) ?? null;
}

/**
 * Window in which a repeat "Send code" is treated as the same request rather than
 * a new one. Long enough to swallow a double-click (and the two near-simultaneous
 * POSTs it produces on a cold serverless start), short enough that a guest who
 * genuinely never received the mail still gets a fresh code on the next press.
 */
export const OTP_DEDUPE_WINDOW_MS = 15_000;

/**
 * True when this "Send code" press is a duplicate of one already in flight — an
 * unexpired code was minted for the address moments ago, so its email is already
 * on its way. Suppressing the second mint is what stops the guest receiving two
 * codes at once. Pure; `latest` is the newest unused row (null if none).
 */
export function isDuplicateOtpRequest(
  latest: { createdAt: Date; expiresAt: Date } | null | undefined,
  now: Date,
  windowMs: number = OTP_DEDUPE_WINDOW_MS,
): boolean {
  if (!latest) return false;
  if (latest.expiresAt < now) return false;
  return now.getTime() - latest.createdAt.getTime() < windowMs;
}
