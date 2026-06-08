# Cloudbeds MCP — TODO

## Current Sprint — local DONE, now launch on Stayable Vercel
- [x] **All 8 keys validated LIVE** — registry routing + getHotelDetails read
      confirmed for every property using the real Cloudbeds IDs.
- [ ] **Commit + push code to `Stayable/cloudbeds_mcp02`** (awaiting Kyle's go-ahead)
      so Stayable Vercel can import it. No secrets committed (.env is gitignored).
- [ ] **Create Stayable Vercel project** — import repo, Root Directory =
      `cloudbeds-mcp-server`, add env vars (8 keys keyed by REAL Cloudbeds ID +
      MCP_BEARER_TOKEN), deploy, disable Deployment Protection.
- [ ] **Rotate all 8 keys** after launch (they were pasted in chat).

## Backlog — Deployment
- [ ] **Fix Vercel root directory** — the `claude-code` Vercel project Root Directory
      is set to `middleware` (a folder that does not exist) → every build fails on clone.
      Change it to `cloudbeds-mcp-server` (or disconnect Git integration).
- [ ] **Set Vercel env vars** (Preview + Production):
      `MCP_BEARER_TOKEN`, `CLOUDBEDS_API_KEY_<id>` per property, optional `CLOUDBEDS_ALLOW_WRITES=true`.
- [ ] **Disable Deployment Protection** for the preview/prod deployment so external
      MCP clients reach `/api/mcp` instead of Vercel's 403.
- [ ] **Redeploy** after env vars (they only apply to new builds).
- [ ] **client-portal deploy** (separate Vercel project): needs `DATABASE_URL`,
      `JWT_SECRET`, `MAGIC_LINK_SECRET`, SMTP vars, `NEXT_PUBLIC_APP_URL`; build script
      likely needs `prisma generate && next build`.

## Backlog — Credentials & Properties
- [ ] **Add the remaining 7 property keys** — one `CLOUDBEDS_API_KEY_<id>` per
      Stayable Cloudbeds account (812, 2295, 2535, 4645, 5399, 6802, 8700, 44199).
      Each property is a separate account; create a self-service key from each.
- [ ] **ROTATE exposed key** — `cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6` was pasted in
      a prior chat (claimed for 812 → 2535 → 5399; the latest stated mapping is 5399).
      Regenerate it in Cloudbeds and update env. Treat as compromised.
- [ ] **Confirm key→property mapping** definitively via `list_properties` once keys are set.

## Backlog — Code Quality / Verification
- [ ] **End-to-end live test** — once network access exists, call read tools against a
      real property and confirm responses (sandbox blocks `api.cloudbeds.com`).
- [ ] **Keep the two tool/client copies in sync** — `cloudbeds-mcp/src/{client,tools}.ts`
      ↔ `cloudbeds-mcp-server/lib/{cloudbeds,tools}.ts`. Consider extracting a shared
      package to eliminate the duplication risk.
- [ ] **Re-validate any new endpoints** against `pms-v1.2-openapi.yaml` before adding tools.

## Completed
- [x] Built `cloudbeds-mcp/` — local stdio MCP server, 15 tools.
- [x] Built `cloudbeds-mcp-server/` — deployable HTTP MCP server (Next.js + mcp-handler),
      bearer-token gated.
- [x] Validated all tool definitions against the official `pms-v1.2-openapi.yaml`
      (fixed `propertyIDs` plural params, `firstName`/`lastName` filters, removed the
      nonexistent `getTransactions`, corrected `reservationNote`/`cardType`).
- [x] Implemented per-property API key registry (`CloudbedsRegistry`) for the 8
      separate Cloudbeds accounts, with single-key fallback. Unit-tested routing.
- [x] Both packages build clean and register all 15 tools (verified).
- [x] Pushed to `rbeyer999/Claude-Code` branch `claude/serene-clarke-S0kHP` (commit 4da98c9).
- [x] Diagnosed Vercel failures as the unrelated `middleware` Root Directory misconfig.
- [x] Cloned repo into this workspace; created `CLAUDE.md` and `todo.md`.
- [x] Built `cloudbeds-mcp/` locally (npm install + tsc clean, `dist/` present).
- [x] Scaffolded `cloudbeds-mcp/.env` with all 8 property slots labeled (gitignored).
- [x] Registered the MCP for this project in `.mcp.json` (uses `node --env-file`,
      no secrets in the committed config).
- [x] Smoke-tested the stdio handshake — server starts, loads .env, registers all
      12 read tools (writes correctly hidden with ALLOW_WRITES=false).
- [x] Audited keys in previous_chat.md: only 1 key exists, mapping stated 3 ways.
- [x] Received fresh keys for all 8 properties; filled `cloudbeds-mcp/.env`.
- [x] Verified the registry loads all 8 property IDs (812, 2295, 2535, 4645,
      5399, 6802, 8700, 44199). NOT yet validated against live Cloudbeds API.
