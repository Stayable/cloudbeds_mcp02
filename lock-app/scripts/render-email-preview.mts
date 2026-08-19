/**
 * Rebuilds the repo-root email-preview.html gallery from the PRODUCTION email
 * builders, so the preview can never drift from what actually gets sent.
 *
 * The gallery was hand-assembled the first time and went stale the moment the
 * OTP card changed; this script exists so "regenerate the preview" is one
 * command instead of hand-editing 37KB of escaped markup.
 *
 *   cd lock-app && npx tsx scripts/render-email-preview.mts
 *
 * Each card renders its email inside a sandboxed <iframe srcdoc>, so the email's
 * own CSS can't leak into the gallery chrome and vice versa.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { buildOtpEmail, senderFrom } from "../src/lib/email";
import { buildGuestEmail, GUEST_EMAIL_SENDER, GUEST_EMAIL_REPLY_TO, type GuestEmailKind, type GuestEmailData } from "../src/lib/guest-email";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../email-preview.html");

// Fixed sample data — no Date.now(), no randomness, so re-running with no code
// change produces a byte-identical file and the diff shows only real changes.
const SAMPLE: GuestEmailData = {
  guestFirstName: "Marcus",
  propertyName: "Stayable Lakeland",
  roomNumber: "239",
  doorCode: "482915",
  checkInDate: "Fri, Jun 27",
  checkOutDate: "Mon, Jun 30",
};
const OTP_CODE = "482915";

interface Card {
  tag: string;
  subject: string;
  from: string;
  replyTo: string | null;
  html: string;
}

const guestCard = (tag: string, kind: GuestEmailKind, data: GuestEmailData = SAMPLE): Card => {
  const { subject, html } = buildGuestEmail(kind, data);
  return { tag, subject, from: GUEST_EMAIL_SENDER, replyTo: GUEST_EMAIL_REPLY_TO, html };
};

const otp = buildOtpEmail(OTP_CODE);
const cards: Card[] = [
  // The OTP email is the odd one out: different sender, no reply-to, and its
  // code is a single contiguous run so it can be pasted into the login field.
  { tag: "7. OTP sign-in (staff)", subject: otp.subject, from: senderFrom(undefined), replyTo: null, html: otp.html },
  guestCard("1. New code generated (check-in)", "generated"),
  guestCard("2. Checkout (no code)", "revoked", { ...SAMPLE, doorCode: null }),
  guestCard("3. Room change (new code)", "room_changed"),
  guestCard("4. Rotated code", "updated"),
  guestCard("5. Code revoked only (safeguard)", "code_revoked", { ...SAMPLE, doorCode: null }),
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const section = (c: Card) => `<section class="card"><header class="card-h"><span class="tag">${esc(c.tag)}</span>`
  + `<div class="subj"><span class="subj-l">Subject</span> ${esc(c.subject)}</div>`
  + `<div class="meta">From <strong>${esc(c.from)}</strong>${c.replyTo ? ` · Reply-to <strong>${esc(c.replyTo)}</strong>` : ""}</div>`
  + `</header><iframe sandbox srcdoc="${esc(c.html)}" title="${esc(c.tag)}"></iframe></section>`;

const page = `<style>
  :root{--navy:#041E42;--ink:#08152B;--blue:#1E8FF2;--gold:#FDDA24;--canvas:#EEF1F6;--muted:#6B7686;--line:#dfe4ec;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--canvas);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.55;}
  .wrap{max-width:1180px;margin:0 auto;padding:40px 24px 64px;}
  .top h1{font-size:30px;letter-spacing:-.01em;margin:0 0 8px;text-wrap:balance;}
  .top h1::after{content:"";display:block;width:54px;height:3px;background:var(--gold);margin-top:14px;border-radius:2px;}
  .top p{color:var(--muted);font-size:15px;max-width:60ch;margin:14px 0 0;}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:36px;}
  @media(max-width:880px){.grid{grid-template-columns:1fr;}}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(8,21,43,.04);}
  .card-h{padding:18px 20px;border-bottom:1px solid var(--line);background:#fbfcfe;}
  .tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);background:#eaf3fe;border:1px solid #d4e7fb;padding:4px 10px;border-radius:999px;}
  .subj{margin-top:12px;font-size:15px;font-weight:600;color:var(--ink);}
  .subj-l{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:8px;}
  .meta{margin-top:6px;font-size:12px;color:var(--muted);}
  iframe{width:100%;height:560px;border:0;background:#F4F6FA;display:block;}
</style>
<div class="wrap"><header class="top"><h1>Stayable — Email Templates</h1><p>Generated from the production builders by <code>lock-app/scripts/render-email-preview.mts</code> — do not hand-edit. Logo loads from the lock-app production alias.</p></header><div class="grid">${cards.map(section).join("")}</div></div>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${cards.length} templates)`);
