/**
 * OTP login email via Resend's REST API (no SMTP, no SDK dependency — works on
 * the Vercel nodejs runtime with a plain fetch). The message body is built by a
 * pure function (buildOtpEmail) so it can be unit-tested; sendOtpEmail is the
 * thin I/O wrapper. Mirrors client-portal's email approach but Stayable-branded.
 */

import { emailShell, codeCard } from "./guest-email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NAVY = "#041E42"; // Stayable brand navy, matches the app headers
const SENDER_NAME = "Stayable Locks";
const DEFAULT_SENDER_ADDRESS = "admin@rentstayable.com"; // DNS-verified in Resend

/**
 * Compose the From header. Resend shows the friendly name only when the value is
 * `Name <addr>` — a bare address renders as just the address. So accept either: a
 * full `Name <addr>` (used as-is) or a bare address (wrapped with the Stayable
 * Locks name). Falls back to the verified default so it's always a real sender.
 */
export function senderFrom(configured?: string): string {
  const v = configured?.trim();
  if (!v) return `${SENDER_NAME} <${DEFAULT_SENDER_ADDRESS}>`;
  return v.includes("<") ? v : `${SENDER_NAME} <${v}>`;
}

export function buildOtpEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `Your Stayable Locks sign-in code: ${code}`;
  // Shares the design system with the guest emails (emailShell + codeCard), with
  // the "LOCKS" sub-wordmark and a staff-facing, utilitarian tone.
  const body = `<div style="padding:40px 44px 8px;">
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:${NAVY};margin:0 0 8px;font-weight:700;">Your sign-in code</h2>
      <p style="font-size:16px;line-height:1.6;color:#44505F;margin:0 0 6px;">Enter this code to sign in to Stayable Locks. It expires in <strong style="color:${NAVY};">15 minutes</strong>.</p>
    </div>
    ${codeCard("Your sign-in code", code)}
    <div style="padding:14px 44px 4px;"><p style="font-size:14px;line-height:1.6;color:#6B7280;margin:0;">If you didn't request this, you can safely ignore this email — no one can sign in without the code.</p></div>`;
  const html = emailShell({
    preheader: `Your Stayable sign-in code is ${code} — it expires in 15 minutes.`,
    body,
    sub: true,
    footer: "Sent by Stayable Locks",
  });
  const text = `Stayable Locks\n\nYour sign-in code is: ${code}\n\nIt expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`;
  return { subject, html, text };
}

/**
 * Sends the OTP code via Resend. Throws on misconfiguration or a non-2xx
 * response so the caller can decide how to degrade (auth.ts logs + falls back).
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  // EMAIL_FROM may be a bare address or a full "Name <addr>" — senderFrom always
  // yields a friendly-named sender on the verified domain.
  const from = senderFrom(process.env.EMAIL_FROM);

  const { subject, html, text } = buildOtpEmail(code);
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: email, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
}
