/**
 * OTP login email via Resend's REST API (no SMTP, no SDK dependency — works on
 * the Vercel nodejs runtime with a plain fetch). The message body is built by a
 * pure function (buildOtpEmail) so it can be unit-tested; sendOtpEmail is the
 * thin I/O wrapper. Mirrors client-portal's email approach but Stayable-branded.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NAVY = "#041E42"; // Stayable brand navy, matches the app headers

export function buildOtpEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `Your Stayable Locks sign-in code: ${code}`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${NAVY}; padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">Stayable Locks</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: ${NAVY}; margin-top: 0;">Your sign-in code</h2>
          <p>Enter this code to sign in. It expires in 15 minutes.</p>
          <div style="text-align: center; margin: 28px 0;">
            <span style="display: inline-block; background: #f3f4f6; color: ${NAVY}; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; border-radius: 8px;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email — no one can sign in without the code.</p>
        </div>
      </body>
    </html>
  `;
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
  const from = process.env.EMAIL_FROM || "Stayable Locks <onboarding@resend.dev>";

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
