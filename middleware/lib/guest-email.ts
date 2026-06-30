/**
 * Guest-facing door-code emails (Resend REST API).
 *
 * ⚠️ DUPLICATE of lock-app/src/lib/guest-email.ts — Vercel can't import across
 * sibling apps, so the two must be kept identical (same discipline as the
 * cloudbeds/tools client pair). Any change here must be mirrored there.
 *
 * Sender + reply-to are blake@rentstayable.com — a monitored Outlook inbox on the
 * Resend-verified rentstayable.com domain — so a guest can simply reply with a
 * question. Design + tokens follow claude-design-guest-code-notification.md.
 *
 * "rotated" means the GUEST's own code value changed (a re-issue / resend), NOT
 * staff backup-PIN rotation, which is internal and never emailed to guests.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Brand tokens (match the lock-app + the design brief).
const NAVY = "#041E42";
const BLUE = "#1E8FF2";
const GOLD = "#FDDA24";
const CANVAS = "#F4F6FA";
const INK = "#08152B";

export const GUEST_EMAIL_SENDER = "Stayable <blake@rentstayable.com>";
export const GUEST_EMAIL_REPLY_TO = "blake@rentstayable.com";

export type GuestEmailKind = "generated" | "updated" | "room_changed" | "revoked";

export interface GuestEmailData {
  guestFirstName?: string | null;
  propertyName: string;
  roomNumber: string;
  /** Required for generated/updated/room_changed; omitted for revoked. */
  doorCode?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  /** Defaults to the monitored reply-to inbox. */
  supportEmail?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(inner: string, preheader: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${INK};">
        <tr><td style="background:${NAVY};border-radius:10px 10px 0 0;padding:22px 28px;border-bottom:3px solid ${GOLD};">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px;">Stayable</span>
        </td></tr>
        <tr><td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:30px 28px;line-height:1.6;">
          ${inner}
        </td></tr>
        <tr><td style="padding:18px 28px;color:#8a94a6;font-size:12px;line-height:1.5;">
          Questions? Just reply to this email and a real person will help.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function codeCard(doorCode: string): string {
  return `<div style="margin:24px 0;border:1px solid #e5e7eb;border-top:3px solid ${GOLD};border-radius:10px;padding:22px;text-align:center;background:#fbfcfe;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#8a94a6;">YOUR DOOR CODE</div>
    <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:38px;font-weight:700;letter-spacing:8px;color:${NAVY};margin-top:8px;">${esc(doorCode)}</div>
  </div>`;
}

function stayLine(d: GuestEmailData): string {
  if (!d.checkInDate && !d.checkOutDate) return "";
  return `<p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Your stay: ${esc(d.checkInDate ?? "—")} – ${esc(d.checkOutDate ?? "—")}.</p>`;
}

function howTo(roomNumber: string, doorCode: string): string {
  return `<ol style="padding-left:18px;color:${INK};font-size:15px;margin:8px 0 0;">
    <li style="margin-bottom:6px;">Go to Room ${esc(roomNumber)}.</li>
    <li style="margin-bottom:6px;">Tap the keypad to wake it.</li>
    <li>Enter <strong>${esc(doorCode)}</strong>, then press the unlock key.</li>
  </ol>`;
}

/**
 * Build the subject/html/text for one guest email. Pure — no I/O. The door code
 * is the hero for code-bearing kinds; "revoked" intentionally carries no code.
 */
export function buildGuestEmail(kind: GuestEmailKind, data: GuestEmailData): { subject: string; html: string; text: string } {
  const name = (data.guestFirstName ?? "").trim() || "Guest";
  const property = data.propertyName;
  const room = data.roomNumber;
  const code = (data.doorCode ?? "").trim();
  const at = `Room ${room} at ${property}`;

  if (kind === "revoked") {
    const subject = `Thank you for staying with us at ${property}`;
    const inner = `<h2 style="color:${NAVY};margin:0 0 6px;font-size:22px;">Thank you, ${esc(name)}.</h2>
      <p style="margin:0 0 14px;">We hope you enjoyed your stay in ${esc(at)}. Your door code has now been deactivated as your stay has ended.</p>
      <p style="margin:0;">It was a pleasure hosting you — we'd love to welcome you back anytime. Safe travels!</p>`;
    const text = `Thank you, ${name}.\n\nWe hope you enjoyed your stay in ${at}. Your door code has now been deactivated as your stay has ended.\n\nIt was a pleasure hosting you — we'd love to welcome you back anytime. Safe travels!\n\nQuestions? Just reply to this email.`;
    return { subject, html: shell(inner, `Thank you for staying at ${property}.`), text };
  }

  // Code-bearing kinds.
  let subject: string;
  let lead: string;
  let extra = "";
  if (kind === "room_changed") {
    subject = `Your new door code for Room ${room} at ${property}`;
    lead = `Thanks for your patience, ${esc(name)} — you've been moved to ${esc(at)}. Here is your new door code.`;
    extra = `<p style="margin:14px 0 0;color:#6b7280;font-size:14px;">Your previous room's code no longer works.</p>`;
  } else if (kind === "updated") {
    subject = `Your door code has been updated — Room ${room} at ${property}`;
    lead = `Hi ${esc(name)}, your door code for ${esc(at)} has been updated. Please use the new code below.`;
    extra = `<p style="margin:14px 0 0;color:#6b7280;font-size:14px;">Any previous code no longer works.</p>`;
  } else {
    subject = `You're all set — your door code for Room ${room}`;
    lead = `You're all set, ${esc(name)}. Your door code for ${esc(at)} is ready.`;
  }

  const inner = `<h2 style="color:${NAVY};margin:0 0 6px;font-size:22px;">${kind === "generated" ? `Welcome, ${esc(name)}!` : esc(name + ",")}</h2>
    <p style="margin:0 0 4px;">${lead}</p>
    ${codeCard(code)}
    <p style="font-weight:600;margin:0 0 4px;color:${INK};">How to get in</p>
    ${howTo(room, code)}
    ${stayLine(data)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">This code is unique to your stay — please don't share it. It stops working automatically at checkout.</p>
    ${extra}
    <p style="margin:18px 0 0;"><a href="mailto:${esc(data.supportEmail ?? GUEST_EMAIL_REPLY_TO)}" style="color:${BLUE};">Code not working? Reply to this email.</a></p>`;

  const text = `${kind === "generated" ? `Welcome, ${name}!` : `${name},`}\n\n${lead.replace(/<[^>]+>/g, "")}\n\nYOUR DOOR CODE: ${code}\n\nHow to get in:\n1. Go to Room ${room}.\n2. Tap the keypad to wake it.\n3. Enter ${code}, then press the unlock key.\n${data.checkInDate || data.checkOutDate ? `\nYour stay: ${data.checkInDate ?? "—"} – ${data.checkOutDate ?? "—"}.\n` : ""}\nThis code is unique to your stay — please don't share it. It stops working automatically at checkout.\n\nQuestions? Just reply to this email.`;
  return { subject, html: shell(inner, `Your Room ${room} door code.`), text };
}

/**
 * Send a guest email via Resend. From + reply-to are the monitored blake@ inbox.
 * Throws on misconfig / non-2xx so the caller can decide how to degrade (an email
 * failure must never block the door-code create/revoke itself).
 */
export async function sendGuestEmail(to: string, kind: GuestEmailKind, data: GuestEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const { subject, html, text } = buildGuestEmail(kind, data);
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: GUEST_EMAIL_SENDER, to, reply_to: GUEST_EMAIL_REPLY_TO, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
}
