/**
 * Cloudbeds webhook authentication.
 *
 * IMPORTANT (design corrected 2026-06-13 vs the Cloudbeds docs): Cloudbeds does
 * NOT HMAC-sign its webhooks — no signature header or signing mechanism exists.
 * The build guide's "verify HMAC" step was wrong. Instead we gate the endpoint
 * with a secret URL token: the webhook is registered as
 *   POST /api/cloudbeds-webhook?token=<WEBHOOK_SECRET>
 * and we verify that token on every request with a constant-time compare.
 *
 * Source: https://developers.cloudbeds.com/docs/webhooks-1
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare. timingSafeEqual throws on length mismatch, so we
 * guard that first — but length is not itself secret here (the token is fixed
 * length), and an early length check does not leak the secret's content.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the `token` query param against WEBHOOK_SECRET. Returns false (never
 * throws) so the caller can answer 401 uniformly.
 */
export function verifyWebhookToken(req: Request): boolean {
  const secret = (process.env.WEBHOOK_SECRET ?? "").trim();
  if (!secret) return false; // fail closed if the secret is unset

  const token = new URL(req.url).searchParams.get("token") ?? "";
  return safeEqual(token, secret);
}
