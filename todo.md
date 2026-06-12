# Cloudbeds MCP — TODO

## ACTIVE: TTLock ↔ Cloudbeds Middleware + Lock App (2026-06-12)
Spec: `docs/superpowers/specs/2026-06-12-ttlock-cloudbeds-middleware-design.md`
Status: **spec APPROVED. Phase 2 + 3 built. TTLock auth VALIDATED LIVE on Vercel.**
RESUME HERE (2026-06-13): `/api/ttlock-test` returns `auth:success` (uid 50221478,
90-day token) on the deployed middleware. The whole 10007 saga root cause:
**the OAuth password grant uses the lock-owning `lock2.ttlock.com` account password,
NOT the `euopen.ttlock.com` developer-portal password** (different account/password,
same email). API host is `euapi.ttlock.com` (euopen 404s). Both now correct in Vercel.
`lockCount:0` is EXPECTED — no locks registered to this account yet (installed ones
still on devicethread; rest unpurchased). It does NOT prove the client_id is old;
can't disambiguate without a lock. The ONLY way to confirm `4ec9049d…` = `main`:
**Gerardo registers 1 test lock to the account, then re-hit `/api/ttlock-test` →
lockCount should become 1** (also proves E2E). Auth being solved UNBLOCKS Phase 3
(Neon) + Phase 4 (webhook) — neither depends on lockCount.
Still needed: provision Neon (`DATABASE_URL`), generate `WEBHOOK_SECRET`.
Legend: 🟢 ready now · 🟡 needs an input · 🔴 blocked on Gerardo/on-site · P0 = critical path

### Phase 0 — Prereqs
- [~] 🔴 P0 Verify `client_id 4ec9049d…` is the **`main`** app — auth confirmed, but
      `lockCount:0` (no locks yet) so main-vs-old is UNVERIFIABLE until a lock is
      registered. Blocked on Gerardo registering 1 test lock → re-check lockCount.
- [x] 🟢 TTLock creds (use **lock2.ttlock.com** account password, NOT euopen portal pw)
- [ ] 🟡 P0 Generate long random `WEBHOOK_SECRET` → `.env.local` + Vercel
- [x] 🟢 Confirm `admin@rentstayable.com` owns the locks + the app (it does; auth OK)

### Phase 1 — Infrastructure (remote)
- [ ] 🟡 P0 Provision **Neon Postgres** via Vercel Marketplace
- [ ] 🟡 Create 2 Vercel projects → Root Dirs `middleware/`, `lock-app/`
- [ ] 🟡 Connect the one Neon DB to both projects (shared `DATABASE_URL`)

### Phase 2 — middleware: TTLock auth (validates creds) ⭐
- [x] 🟢 P0 Scaffold `middleware/` (Next 14 + TS) — typecheck + build pass
- [x] 🟢 P0 `lib/ttlock.ts` — token (MD5 password) + cache, listLocks, create/deletePasscode
- [x] 🟢 P0 `GET /api/ttlock-test` → returns auth status, uid, lockCount, isMainApp
- [x] 🟢 Deploy/run → hit `/api/ttlock-test` → `auth:success` on Vercel (2026-06-13)

### Phase 3 — Database (Prisma on Neon)
- [x] 🟢 P0 Schema: `LockMap`, `Passcode`, `EventLog` (`middleware/prisma/schema.prisma`)
      + `lib/db.ts` singleton; prisma generate + build pass. UNCOMMITTED (held so it
      doesn't churn the in-flight Vercel deploy of 791ea00).
- [ ] 🟡 P0 Provision Neon → set `DATABASE_URL` → `prisma migrate` / `db push`

### Phase 4 — middleware: webhook (core)
- [ ] 🟢 P0 `lib/webhook-auth.ts` — HMAC verify
- [ ] 🟢 P0 `POST /api/cloudbeds-webhook` — map lookup, create/delete PIN, store `keyboardPwdId`, log
- [ ] 🟡 P0 Validate against a **real Cloudbeds webhook payload** (guide field names are assumed)

### Phase 5 — lock-app: management UI (parallel once DB exists)
- [ ] 🟢 Scaffold `lock-app/` (reuse `client-portal` magic-link auth)
- [ ] 🟢 Admin: LockMap CRUD, view/revoke/issue PINs, event log
- [ ] 🟢 Field (mobile): room lookup → current PIN, mark lock registered

### Phase 6 — Cloudbeds webhook registration
- [ ] 🟡 Register webhook in all **8** Cloudbeds accounts → 1 endpoint
- [ ] 🟡 Resolve property identity per payload

### Phase 7 — End-to-end live test
- [ ] 🔴 P0 Gerardo registers 1 test lock to `main`; read its Lock ID
- [ ] 🟡 Map (property,room)→lockId; live reservation → PIN opens door → checkout deletes it

### Phase 8 — Hardening (tracked, not v1)
- [ ] Guest PIN delivery (Cloudbeds messaging/SMS) · token auto-refresh (90-day) · error alerting · TTLock plan upgrade at 912+ locks

### Blocked on others
- **Gerardo (on-site):** register locks to `main` (ignore old apps); read Lock IDs;
  devicethread→Stayable transfer for 5 installed properties; 1 test lock now.
- **Procurement:** TTLock plan tier for 912+ locks.

### Property lock counts (from build guide, 2026-06-11)
| Property | Cloudbeds ID | Locks | Lock status |
|----------|-------------|-------|-------------|
| Lakeland | 210972 | 176 | devicethread — transfer needed |
| St. Augustine | 208155 | 163 | devicethread — transfer needed |
| Davenport | 318197 | 178 | devicethread — transfer needed |
| Kissimmee East | 210986 | 206 | devicethread — transfer needed |
| Jacksonville West | 210987 | 189 | devicethread — transfer needed |
| Kissimmee West | 210969 | 176 | not yet purchased — register direct |
| Orlando OBT | 210971 | 214 | not yet purchased — register direct |
| Jacksonville North | 206628 | 150 | not yet purchased — ownership TBD |

---

## In Progress (as of 2026-06-09)
- **Stayable Vercel deploy** — importing `Stayable/cloudbeds_mcp02`. Hit
  "No Next.js version detected" → cause is **Root Directory not set to
  `cloudbeds-mcp-server`** (repo root has no package.json). Confirmed the pushed
  commit has `cloudbeds-mcp-server/package.json` with `next ^14.2.0`. Fix: set
  Root Directory = `cloudbeds-mcp-server` (Settings → Build & Deployment), then
  redeploy. Awaiting confirmation that this cleared the error.

## Current Sprint — local DONE, now launch on Stayable Vercel
- [x] **All 8 keys validated LIVE** — registry routing + getHotelDetails read
      confirmed for every property using the real Cloudbeds IDs.
- [x] **Committed + pushed to `Stayable/cloudbeds_mcp02`** (commit 2fabb65, default
      branch claude/brave-maxwell-756k2c). No secrets committed.
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
