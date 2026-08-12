/**
 * Welcome/invite email for a newly-added lock-app user. Same split as email.ts:
 * a pure builder (unit-tested) plus a thin Resend wrapper. Reuses emailShell so
 * the invite matches the Stayable email system (navy header, hosted logo, gold
 * hairline) shipped 2026-07-01.
 *
 * There is no password to send — lock-app is OTP-only, so the email's whole job
 * is to tell the person the app exists, where it is, and that they sign in with
 * THIS address.
 */
import { emailShell } from "./guest-email";
import { senderFrom } from "./email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NAVY = "#041E42";

/** Where staff sign in. Overridable for preview deploys. */
export function appUrl(): string {
  return process.env.APP_URL?.trim() || "https://lock.rentstayable.com";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildInviteEmail(opts: {
  name: string;
  email: string;
  roleName: string;
  scopeSummary: string;
  url?: string;
}): { subject: string; html: string; text: string } {
  const url = opts.url ?? appUrl();
  const subject = "You've been given access to Stayable Locks";
  const firstName = opts.name.trim().split(/\s+/)[0] || "there";

  const row = (k: string, v: string) =>
    `<tr>
      <td style="padding:7px 0;font-size:13px;color:#8A94A6;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
      <td style="padding:7px 0 7px 18px;font-size:15px;color:${NAVY};font-weight:600;">${esc(v)}</td>
    </tr>`;

  const body = `<div style="padding:40px 44px 8px;">
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:${NAVY};margin:0 0 10px;font-weight:700;">You're in, ${esc(firstName)}</h2>
      <p style="font-size:16px;line-height:1.6;color:#44505F;margin:0 0 18px;">You've been given access to <strong style="color:${NAVY};">Stayable Locks</strong> — the app for guest door codes, backup PINs, and lock status across the portfolio.</p>
    </div>
    <div style="padding:0 44px;">
      <div style="background:#fff;border:1px solid #EAEEF4;border-top:3px solid #FDDA24;border-radius:14px;padding:22px 26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          ${row("Sign in with", opts.email)}
          ${row("Role", opts.roleName)}
          ${row("Access", opts.scopeSummary)}
        </table>
      </div>
    </div>
    <div style="padding:26px 44px 8px;text-align:center;">
      <a href="${esc(url)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 38px;border-radius:10px;">Open Stayable Locks</a>
    </div>
    <div style="padding:20px 44px 4px;">
      <p style="font-size:14px;line-height:1.6;color:#44505F;margin:0 0 8px;"><strong style="color:${NAVY};">There's no password.</strong> Enter your email address on the sign-in screen and we'll email you a 6-digit code. The code lasts 15 minutes.</p>
      <p style="font-size:13px;line-height:1.6;color:#6B7280;margin:0;">Use <strong>${esc(opts.email)}</strong> — a code is only sent to an address that's already been given access.</p>
    </div>`;

  const html = emailShell({
    preheader: "You've been given access to Stayable Locks — sign in with your work email, no password needed.",
    body,
    sub: true,
    footer: "Sent by Stayable Locks",
  });

  const text = [
    `You're in, ${firstName}`,
    "",
    "You've been given access to Stayable Locks.",
    "",
    `Sign in with: ${opts.email}`,
    `Role: ${opts.roleName}`,
    `Access: ${opts.scopeSummary}`,
    "",
    url,
    "",
    "There's no password. Enter your email address and we'll email you a 6-digit code (valid 15 minutes).",
  ].join("\n");

  return { subject, html, text };
}

/** Sends the invite. Throws on failure — callers treat delivery as best-effort. */
export async function sendInviteEmail(opts: {
  name: string;
  email: string;
  roleName: string;
  scopeSummary: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const from = senderFrom(process.env.EMAIL_FROM);
  const { subject, html, text } = buildInviteEmail(opts);

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: opts.email, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
}
