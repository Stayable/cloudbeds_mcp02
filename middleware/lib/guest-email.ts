/**
 * Guest-facing door-code emails (Resend REST API).
 * Markup applied from the Claude Design "Stayable Email System" canvas (navy header
 * + gold hairline, white rounded card, per-digit code boxes, numbered how-to steps).
 *
 * ⚠️ DUPLICATE of lock-app/src/lib/guest-email.ts — Vercel can't import across sibling
 * apps, so the two must be kept identical. Any change here must be mirrored there.
 *
 * Sender + reply-to are blake@rentstayable.com — a monitored Outlook inbox on the
 * Resend-verified rentstayable.com domain — so a guest can simply reply.
 *
 * "rotated" → the GUEST's own code value changed (a re-issue/rotate, kind "updated");
 * NOT staff backup-PIN rotation, which is internal and never emailed to guests.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Brand tokens (match the design canvas + the lock-app).
const NAVY = "#041E42";
const INK_BODY = "#44505F";
const BLUE = "#1E8FF2";
const GOLD = "#FDDA24";
const MUTED = "#6B7280";
const FAINT = "#8A94A6";
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,ui-monospace,Menlo,Consolas,monospace";

// Logo is served from the lock-app public folder (absolute URL so both apps' emails
// resolve it). Uses the always-live Vercel production alias so it renders even before
// the lock.rentstayable.com custom-domain SSL is active; the .vercel.app alias stays
// valid after the custom domain goes primary. Broken-image alt renders white on navy.
const EMAIL_LOGO_URL = "https://lock-app-dusky.vercel.app/brand/stayable-email-logo.png";

export const GUEST_EMAIL_SENDER = "Stayable <blake@rentstayable.com>";
export const GUEST_EMAIL_REPLY_TO = "blake@rentstayable.com";
const FOOTER_NOTE = "Stayable · blake@rentstayable.com";

export type GuestEmailKind = "generated" | "updated" | "room_changed" | "revoked" | "code_revoked";

export interface GuestEmailData {
  guestFirstName?: string | null;
  propertyName: string;
  roomNumber: string;
  /** Required for generated/updated/room_changed; omitted for revoked/code_revoked. */
  doorCode?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  /** Defaults to the monitored reply-to inbox. */
  supportEmail?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Outer email chrome: canvas bg, hidden preheader, navy header + logo, gold hairline, footer. */
export function emailShell(opts: { preheader: string; body: string; sub?: boolean; footer?: string }): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#E7ECF3;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#E7ECF3;font-size:1px;">${esc(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7ECF3;padding:28px 12px;"><tr><td align="center">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 12px 34px rgba(4,30,66,.12);font-family:${SANS};">
      <div style="background:${NAVY};padding:26px 0;text-align:center;">
        <img src="${EMAIL_LOGO_URL}" alt="Stayable" height="28" style="height:28px;display:block;margin:0 auto;color:#fff;font-weight:700;">
        ${opts.sub ? `<div style="font-size:11px;letter-spacing:.34em;color:#6FB4F5;margin-top:10px;font-weight:700;">L O C K S</div>` : ""}
      </div>
      <div style="height:3px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</div>
      ${opts.body}
      <div style="border-top:1px solid #EAEEF4;padding:22px 44px 30px;text-align:center;">
        <p style="font-size:14px;line-height:1.5;color:${MUTED};margin:0;">Questions? Just reply to this email and a real person will help.</p>
        <p style="font-size:12px;color:${FAINT};margin:10px 0 0;">${esc(opts.footer ?? FOOTER_NOTE)}</p>
      </div>
    </div>
  </td></tr></table>
</body></html>`;
}

/** Per-digit code card (matches the design). `note` is an optional sub-line inside the card. */
export function codeCard(label: string, code: string, note?: string): string {
  const cells = code.split("").map((d) =>
    `<td style="width:46px;height:58px;background:#fff;border:1.5px solid #DCE7F5;border-bottom:3px solid ${BLUE};border-radius:10px;font-family:${MONO};font-size:30px;font-weight:700;color:${NAVY};text-align:center;vertical-align:middle;">${esc(d)}</td>`
  ).join("");
  return `<div style="padding:24px 44px 8px;"><div style="background:#fff;border:1px solid #EAEEF4;border-top:3px solid ${GOLD};border-radius:14px;box-shadow:0 4px 14px rgba(4,30,66,.06);padding:26px;text-align:center;">
    <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${FAINT};font-weight:700;margin-bottom:18px;">${esc(label)}</div>
    <table role="presentation" cellspacing="8" cellpadding="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;"><tr>${cells}</tr></table>
    ${note ? `<div style="font-size:13px;color:${MUTED};margin-top:16px;">${esc(note)}</div>` : ""}
  </div></div>`;
}

function howToSteps(roomNumber: string, doorCode: string): string {
  const step = (n: number, html: string, last = false) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:${last ? 4 : 12}px;"><tr>
      <td width="42" valign="top"><div style="width:30px;height:30px;border-radius:50%;background:${NAVY};color:#fff;font-size:15px;font-weight:700;text-align:center;line-height:30px;font-family:${SANS};">${n}</div></td>
      <td valign="top" style="font-size:16px;line-height:1.5;color:${INK_BODY};padding-top:4px;">${html}</td>
    </tr></table>`;
  return `<div style="padding:18px 44px 4px;">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${BLUE};font-weight:700;margin-bottom:16px;">How to use it</div>
    ${step(1, `Go to <strong style="color:${NAVY};">Room ${esc(roomNumber)}</strong>.`)}
    ${step(2, `Tap the keypad to wake it.`)}
    ${step(3, `Enter <strong style="color:${NAVY};">${esc(doorCode)}</strong>, then press the unlock key.`, true)}
  </div>`;
}

function stayBox(checkIn?: string | null, checkOut?: string | null): string {
  const range = checkIn || checkOut ? `Your stay: ${esc(checkIn ?? "—")} – ${esc(checkOut ?? "—")}` : "Your stay";
  return `<div style="padding:20px 44px 4px;"><div style="background:#F4F6FA;border-radius:12px;padding:18px 20px;">
    <div style="font-size:15px;color:${NAVY};font-weight:700;margin-bottom:4px;">${range}</div>
    <div style="font-size:14px;line-height:1.55;color:${MUTED};">This code is unique to your stay — please don't share it. It stops working automatically at checkout.</div>
  </div></div>`;
}

function helpLine(supportEmail: string, lead = "Code not working?"): string {
  return `<div style="padding:18px 44px 4px;"><p style="font-size:15px;line-height:1.5;color:${INK_BODY};margin:0;">${esc(lead)} <a href="mailto:${esc(supportEmail)}" style="color:${BLUE};text-decoration:none;font-weight:600;">Reply to this email.</a></p></div>`;
}

function intro(headline: string, sub: string, headlineSize = 30): string {
  return `<div style="padding:40px 44px 8px;">
    <h2 style="font-family:${SERIF};font-size:${headlineSize}px;line-height:1.18;color:${NAVY};margin:0 0 8px;font-weight:700;">${headline}</h2>
    <p style="font-size:17px;line-height:1.55;color:${INK_BODY};margin:0;">${sub}</p>
  </div>`;
}

/**
 * Build the subject/html/text for one guest email. Pure — no I/O. Code-bearing
 * kinds carry the full code in the preheader (inbox preview + machine-readable);
 * the visible code is split into per-digit boxes.
 */
export function buildGuestEmail(kind: GuestEmailKind, data: GuestEmailData): { subject: string; html: string; text: string } {
  const name = (data.guestFirstName ?? "").trim() || "Guest";
  const property = esc(data.propertyName);
  const room = esc(data.roomNumber);
  const roomRaw = data.roomNumber;
  const code = (data.doorCode ?? "").trim();
  const support = data.supportEmail ?? GUEST_EMAIL_REPLY_TO;
  const at = `Room ${room} at ${property}`;
  const en = esc(name);

  if (kind === "revoked") {
    const body = `<div style="padding:44px 44px 8px;text-align:center;">
      <h2 style="font-family:${SERIF};font-size:32px;line-height:1.15;color:${NAVY};margin:0 0 16px;font-weight:700;">Thank you, ${en}.</h2>
      <p style="font-size:17px;line-height:1.65;color:${INK_BODY};margin:0 auto 16px;max-width:430px;">We hope you enjoyed your stay in <strong style="color:${NAVY};">Room ${room}</strong> at ${property}. Your door code has now been deactivated as your stay has ended.</p>
      <div style="width:48px;height:3px;background:${GOLD};border-radius:2px;margin:22px auto;"></div>
      <p style="font-size:17px;line-height:1.65;color:${INK_BODY};margin:0 auto;max-width:430px;">It was a pleasure hosting you — we'd love to welcome you back anytime. <strong style="color:${NAVY};">Safe travels!</strong></p>
    </div>`;
    const text = `Thank you, ${name}.\n\nWe hope you enjoyed your stay in Room ${roomRaw} at ${data.propertyName}. Your door code has now been deactivated as your stay has ended.\n\nIt was a pleasure hosting you — we'd love to welcome you back anytime. Safe travels!\n\nQuestions? Just reply to this email.`;
    return { subject: `Thank you for staying with us at ${data.propertyName}`, html: emailShell({ preheader: `Thank you for staying with us at ${data.propertyName} — safe travels!`, body }), text };
  }

  if (kind === "code_revoked") {
    const body = `<div style="padding:40px 44px 8px;">
      <h2 style="font-family:${SERIF};font-size:28px;line-height:1.2;color:${NAVY};margin:0 0 14px;font-weight:700;">A quick update on your door code</h2>
      <p style="font-size:17px;line-height:1.6;color:${INK_BODY};margin:0 0 16px;">${en}, the door code for <strong style="color:${NAVY};">Room ${room}</strong> at ${property} has been deactivated and no longer works.</p>
      <p style="font-size:16px;line-height:1.6;color:${INK_BODY};margin:0;">If you still need access, please contact the front desk or reply to this email and we'll sort it out right away.</p>
    </div>
    <div style="padding:22px 44px 8px;"><div style="background:#F4F6FA;border-radius:12px;padding:18px 20px;text-align:center;">
      <div style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:${FAINT};font-weight:700;">Room ${room} · code inactive</div>
    </div></div>
    ${helpLine(support, "Need help right now?")}`;
    const text = `${name}, the door code for Room ${roomRaw} at ${data.propertyName} has been deactivated and no longer works.\n\nIf you still need access, please contact the front desk or reply to this email and we'll sort it out right away.\n\nQuestions? Just reply to this email.`;
    return { subject: `Your door code for Room ${roomRaw} has been deactivated`, html: emailShell({ preheader: `An update about your door code for Room ${roomRaw} at ${data.propertyName}.` , body }), text };
  }

  // Code-bearing kinds: generated / room_changed / updated.
  let subject: string;
  let preheader: string;
  let body: string;
  if (kind === "room_changed") {
    subject = `Your new door code for Room ${roomRaw} at ${data.propertyName}`;
    preheader = `You've moved to Room ${roomRaw} — here's your new door code, ${code}.`;
    body = intro(`Thanks for your patience, ${en}.`, `You've been moved to <strong style="color:${NAVY};">Room ${room}</strong> at ${property}. Here is your new door code.`, 29)
      + codeCard("Your new door code", code, "Your previous room's code no longer works.")
      + howToSteps(roomRaw, code) + stayBox(data.checkInDate, data.checkOutDate) + helpLine(support);
  } else if (kind === "updated") {
    subject = `Your door code has been updated — Room ${roomRaw}`;
    preheader = `Your door code for Room ${roomRaw} has been updated — new code: ${code}.`;
    body = intro(`Your door code has been updated`, `Your door code for <strong style="color:${NAVY};">Room ${room}</strong> at ${property} has been updated. Please use the new code below — any previous code no longer works.`, 29)
      + codeCard("Your new door code", code)
      + howToSteps(roomRaw, code) + helpLine(support);
  } else {
    subject = `You're all set — your door code for Room ${roomRaw}`;
    preheader = `Your door code for Room ${roomRaw} is ready — ${code}. Works through checkout.`;
    body = intro(`Welcome, ${en}!`, `Your door code for <strong style="color:${NAVY};">Room ${room}</strong> at ${property} is ready.`)
      + codeCard("Your door code", code)
      + howToSteps(roomRaw, code) + stayBox(data.checkInDate, data.checkOutDate) + helpLine(support);
  }

  const stay = data.checkInDate || data.checkOutDate ? `\nYour stay: ${data.checkInDate ?? "—"} – ${data.checkOutDate ?? "—"}.\n` : "";
  const text = `${kind === "generated" ? `Welcome, ${name}!` : `${name},`}\n\nYOUR DOOR CODE: ${code}\n\nHow to use it:\n1. Go to Room ${roomRaw}.\n2. Tap the keypad to wake it.\n3. Enter ${code}, then press the unlock key.\n${stay}\nThis code is unique to your stay — please don't share it. It stops working automatically at checkout.\n\nQuestions? Just reply to this email.`;
  return { subject, html: emailShell({ preheader, body }), text };
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
