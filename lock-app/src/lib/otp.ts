/**
 * Pure OTP helpers for email-code login. The 6-digit code replaces the magic-link
 * URL token; storage/verification orchestration lives in lib/auth.ts. Constant-time
 * compare is not required here (codes are short-lived, single-use, server-checked).
 */
import { randomInt } from "crypto";

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpMatches(
  stored: { code: string | null; used: boolean; expiresAt: Date },
  input: string,
  now: Date,
): boolean {
  if (!stored.code || stored.used) return false;
  if (stored.expiresAt < now) return false;
  return stored.code === input.trim();
}
