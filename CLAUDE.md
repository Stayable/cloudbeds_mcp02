# Cloudbeds MCP — Claude Code Instructions

## Project Overview
A monorepo (RISE8 / Stayable) containing independently deployable apps:
1. **`cloudbeds-mcp/`** — a local **stdio** MCP server exposing the Cloudbeds PMS
   API (v1.2) as tools for Claude Desktop/Code.
2. **`cloudbeds-mcp-server/`** — the same toolset served over **HTTP** (Streamable
   HTTP via `mcp-handler` in a Next.js route), bearer-token gated, deployable to Vercel.
3. **`client-portal/`** — a Next.js + Prisma investor portal with magic-link auth
   (RISE8 capital/portfolio/communications/documents for investors).
4. **`middleware/`** — *(in progress)* headless TTLock ↔ Cloudbeds webhook service:
   auto-creates/deletes guest door PINs from Cloudbeds reservation events.
   Replaces devicethread SmartAccess. Vercel-deployable.
5. **`lock-app/`** — *(planned)* role-based UI (admin + on-site field) to manage the
   room→lock mapping and inspect/override PINs. Shares the middleware's Neon DB.

Both MCP packages expose the **same 15 Cloudbeds tools**, validated against the
official `pms-v1.2-openapi.yaml` spec. Read tools are always on; write tools are
gated behind `CLOUDBEDS_ALLOW_WRITES=true`.

## Tech Stack
- **MCP**: TypeScript, `@modelcontextprotocol/sdk` ^1.12, `zod` ^3.23, `mcp-handler` ^1.0 (HTTP), `tsx` for dev.
- **client-portal**: Next.js 14 (App Router), React 18, Prisma 5, Tailwind, Radix UI, `recharts`, `nodemailer`, `jsonwebtoken`, `bcryptjs`.
- **Runtime**: Node >= 18. HTTP MCP route pins `runtime = "nodejs"` (MCP SDK is not edge-compatible).

## Architecture Quick Reference
| Path | Purpose |
|------|---------|
| `cloudbeds-mcp/src/client.ts` | `CloudbedsClient` (thin v1.2 HTTP client) + `CloudbedsRegistry` (per-property key routing) |
| `cloudbeds-mcp/src/tools.ts` | All 15 tool definitions (read + write), shared logic |
| `cloudbeds-mcp/src/index.ts` | stdio entrypoint — wires registry + tools to `StdioServerTransport` |
| `cloudbeds-mcp-server/lib/cloudbeds.ts` | **Duplicate** of the client/registry (Vercel can't import siblings) |
| `cloudbeds-mcp-server/lib/tools.ts` | **Duplicate** of tool definitions |
| `cloudbeds-mcp-server/app/api/[transport]/route.ts` | HTTP handler + `withBearer` auth gate (503 if no `MCP_BEARER_TOKEN`, 401 on mismatch) |
| `client-portal/src/app/(portal)/...` | Investor-facing pages (dashboard, capital, portfolio, communications, documents) |
| `client-portal/src/app/admin/...` | Admin pages (investors, properties, communications) |
| `client-portal/src/lib/` | `auth.ts` (JWT/magic link), `db.ts` (Prisma), `email.ts` (nodemailer) |
| `client-portal/prisma/schema.prisma` | Data model + `seed.ts` |

### Critical design fact: per-property API keys
Stayable's **8 properties are 8 SEPARATE Cloudbeds accounts**, not one group
account. There is no single all-properties key. The `CloudbedsRegistry`
(in both `cloudbeds.ts` files) routes each call to the key matching its
`propertyID` argument:
- Set one env var per property: `CLOUDBEDS_API_KEY_<propertyID>` (e.g. `CLOUDBEDS_API_KEY_2535`).
- A bare `CLOUDBEDS_API_KEY` or `CLOUDBEDS_ACCESS_TOKEN` is the fallback/default.
- `propertyID` is effectively **required** when more than one key is configured.
- **Run `list_properties` first** — it fans `getHotels` across all keys to confirm which key maps to which property.

**Property IDs — use the REAL Cloudbeds ID, NOT the street-address code.** Cloudbeds
endpoints reject any propertyID but their own ("None of the included property id's
match..."). Env vars are keyed by the real Cloudbeds ID. The real ID is the number
embedded in each account's Client ID (`live1_<realID>_...`). Verified live:

| Property | Street code | **Cloudbeds propertyID** |
|----------|-------------|--------------------------|
| Jacksonville North | 812 | **206628** |
| Jacksonville West | 6802 | **210987** |
| Kissimmee East | 2295 | **210986** |
| Kissimmee West | 5399 | **210969** |
| Lakeland | 4645 | **210972** |
| Orlando OBT | 8700 | **210971** |
| St. Augustine | 2535 | **208155** |
| Davenport | 44199 | **318197** |

Always call tools with the Cloudbeds propertyID (e.g. 206628). `list_properties`
returns the real IDs + names for discovery.

## The 15 Cloudbeds Tools
**Read (always on):** `list_properties`, `get_property`, `get_dashboard`,
`list_reservations`, `get_reservation`, `list_guests`, `get_guest`,
`get_availability`, `list_room_types`, `list_rooms`, `get_rate_plans`,
`list_reservations_with_rates`.
**Write (only when `CLOUDBEDS_ALLOW_WRITES=true`):** `post_reservation_note`,
`post_payment`, `put_reservation_status`.

## TTLock Middleware + Lock App (in progress — see spec)
Design spec: `docs/superpowers/specs/2026-06-12-ttlock-cloudbeds-middleware-design.md`.
Two new Vercel projects (`middleware/`, `lock-app/`) sharing **one Neon Postgres**
(Prisma). The DB is the integration point — Vercel can't import across sibling
folders, so the apps share *data*, not code (same constraint as the MCP pair).

Critical facts (mirror the per-property-key discipline above):
- **TTLock = 1 account, 1 Application = "Stayable Access — main".** Locks are
  globally unique within that account; do NOT split per property. Two "old" apps
  (Jax West, Orlando) are abandoned — Gerardo must register every lock to `main`.
  `client_id 4ec9049d80234753b2238b28231da1a1` — **verify it's `main`, not an old app**
  (auth succeeds but returns zero locks if wrong).
- **Asymmetry is correct:** 1 TTLock account vs 8 Cloudbeds accounts. Cloudbeds maps
  to PMS billing (genuinely 8); TTLock is an access vendor (no per-property split).
- **Webhook registered 8× (once per Cloudbeds account) → 1 endpoint.** Payload must
  carry property identity; the room→lock map is keyed by **(propertyID, roomID)**
  because room IDs are unique only within a property but all map into one TTLock account.
- **Map lives in the DB, NOT a static `roomLockMap.js`** — the lock-app edits it at runtime.
- Webhook is **HMAC-verified** (`WEBHOOK_SECRET`). A `passcode` table stores the TTLock
  `keyboardPwdId` so checkout/cancel can actually delete the PIN.
- TTLock auth: OAuth password grant, **MD5-hashed** password, token cached (~90-day expiry).
- TTLock API gateway: `euapi.ttlock.com` (EU) — NOT `euopen.ttlock.com`, which is
  the docs/portal where the app/client_id is registered and 404s on `/oauth2/token`
  (build-guide error, fixed). TTLock plan upgrade required at 912+ locks
  (Stayable ≈ 1,450).
- Secrets in `middleware/.env.local` (gitignored): `TTLOCK_CLIENT_ID/SECRET/USERNAME/PASSWORD`,
  `WEBHOOK_SECRET`, `CLOUDBEDS_ACCESS_TOKEN`, plus Neon `DATABASE_URL`.

## Current Focus
Wiring this repo up locally and operationalizing the deployed HTTP MCP server,
**and** building the TTLock middleware + lock-app (above). Outstanding: PR #8 merge
decision, deployment config in Vercel, adding the remaining property keys, secret
rotation. See `todo.md`.

## Conventions
- **Tool/client parity**: `cloudbeds-mcp/src/{client,tools}.ts` and
  `cloudbeds-mcp-server/lib/{cloudbeds,tools}.ts` are intentional duplicates.
  **Any change to one must be mirrored to the other** — they must not diverge.
- Validate every Cloudbeds endpoint/param against `pms-v1.2-openapi.yaml`
  (`getReservations` uses `firstName`/`lastName`, NOT `guestName`; several list
  endpoints take `propertyIDs` plural; there is no `getTransactions`).
- Verify changes with `npm run build` / `npm run typecheck` in each package.
- **Secrets never go in committed files** — `.env` only. Cloudbeds keys (`cbat_…`),
  `MCP_BEARER_TOKEN`, JWT/SMTP creds stay in env / Vercel dashboard.
- The deployed HTTP endpoint is `…/api/mcp`; clients must send `Authorization: Bearer <MCP_BEARER_TOKEN>`.
- Per RISE8 org standards: be direct, never fabricate figures, flag uncertainty.

## Known Environment Constraints
- This Claude sandbox's network allowlist **blocks `api.cloudbeds.com` and
  `api.vercel.com`** ("Host not in allowlist"). You CANNOT validate live keys,
  hit the PMS, or run authenticated Vercel CLI deploys from here. Those steps
  happen on the user's machine / Vercel dashboard.
- `cloudbeds-mcp` is **stdio** → runs locally inside a client, NOT deployable to Vercel.
- Only `cloudbeds-mcp-server` (and `client-portal`) are Vercel-deployable; each
  needs its own Vercel project pointed at its subdirectory as Root Directory.

## Token Efficiency
- Read `todo.md` at session start before exploring code.
- Use Edit over Write for existing files.
- Run independent tool calls in parallel.
- This folder's git remote is `Stayable/cloudbeds_mcp02`; the code originated
  from `rbeyer999/Claude-Code` branch `claude/serene-clarke-S0kHP` (PR #8).
