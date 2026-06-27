/**
 * Register the room-change webhook events on every Cloudbeds account so the
 * middleware's reconcile handler actually fires:
 *   reservation/accommodation_changed   (room reassigned)
 *   reservation/accommodation_removed   (room dropped from a multi-room res)
 *
 * Run from the middleware/ directory with its env (CLOUDBEDS_API_KEY_<id> per
 * property, and the webhook receiver URL). Cloudbeds is reachable from your
 * machine (not the Claude sandbox), so run it locally:
 *
 *   # 1) SAFE: list current webhooks for every account (no writes) — confirms
 *   #    the API shape + shows each account's existing endpointUrl.
 *   npx tsx scripts/register-accommodation-webhooks.ts
 *
 *   # 2) APPLY: actually subscribe the two events (idempotent — skips existing).
 *   npx tsx scripts/register-accommodation-webhooks.ts --apply
 *
 * Endpoint URL: by default it REUSES the endpointUrl already on each account
 * (copied from an existing subscription, so it matches exactly, incl. ?token=).
 * If an account has no existing webhook, set MIDDLEWARE_WEBHOOK_URL in env, e.g.
 *   MIDDLEWARE_WEBHOOK_URL="https://<middleware-domain>/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>"
 */
import { readFileSync } from "node:fs";
import { CloudbedsRegistry } from "../lib/cloudbeds";

// --- tiny .env loader (so `npx tsx` works without dotenv installed) ----------
// The per-property CLOUDBEDS_API_KEY_<id> keys live in lock-app/.env.cloudbeds.local;
// also read the middleware's own env, and accept --env=<path> to override.
const envOverride = process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length);
const ENV_FILES = [
  envOverride,
  process.env.ENV_FILE,
  ".env.local",
  ".env",
  "../lock-app/.env.cloudbeds.local",
].filter((f): f is string => !!f);
for (const file of ENV_FILES) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* file not present — fine */
  }
}

const APPLY = process.argv.includes("--apply");
const EVENTS = [
  { object: "reservation", action: "accommodation_changed" },
  { object: "reservation", action: "accommodation_removed" },
];

interface Webhook { subscriptionID?: string; object?: string; action?: string; endpointUrl?: string; [k: string]: unknown }

async function main() {
  const registry = CloudbedsRegistry.fromEnv();
  const propertyIds = registry.propertyIds();
  if (propertyIds.length === 0) {
    console.error("No CLOUDBEDS_API_KEY_<propertyID> env vars found. Run from middleware/ with its .env.");
    process.exit(1);
  }
  console.log(`${APPLY ? "APPLY" : "LIST (dry-run — pass --apply to subscribe)"} · ${propertyIds.length} properties\n`);

  for (const propertyId of propertyIds) {
    const client = registry.resolve(propertyId);
    let existing: Webhook[] = [];
    try {
      const res = await client.get<Webhook[]>("getWebhooks", { propertyID: propertyId });
      existing = (res.data ?? []) as Webhook[];
    } catch (e) {
      console.log(`property ${propertyId}: getWebhooks FAILED — ${(e as Error).message}`);
      continue;
    }

    console.log(`property ${propertyId}: ${existing.length} existing webhook(s)`);
    for (const w of existing) console.log("    raw:", JSON.stringify(w));

    const endpointUrl = process.env.MIDDLEWARE_WEBHOOK_URL?.trim() || existing.find((w) => w.endpointUrl)?.endpointUrl;
    if (!endpointUrl) {
      console.log(`    ! no existing endpointUrl and MIDDLEWARE_WEBHOOK_URL not set — cannot add events for ${propertyId}\n`);
      continue;
    }

    for (const ev of EVENTS) {
      const already = existing.some((w) => w.object === ev.object && w.action === ev.action);
      if (already) { console.log(`    = ${ev.object}/${ev.action} already subscribed`); continue; }
      if (!APPLY) { console.log(`    + would subscribe ${ev.object}/${ev.action} → ${endpointUrl}`); continue; }
      try {
        await client.post("postWebhook", { object: ev.object, action: ev.action, endpointUrl });
        console.log(`    ✓ subscribed ${ev.object}/${ev.action}`);
      } catch (e) {
        console.log(`    ✗ subscribe ${ev.object}/${ev.action} FAILED — ${(e as Error).message}`);
      }
    }
    console.log("");
  }
  console.log(APPLY ? "Done. Re-run without --apply to confirm both events now show as subscribed." : "Dry run only. Re-run with --apply once the listing looks right.");
}

main().catch((e) => { console.error(e); process.exit(1); });
