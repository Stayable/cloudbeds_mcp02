# Cloudbeds MCP — TODO

## ACTIVE: TTLock ↔ Cloudbeds Middleware + Lock App (2026-06-12)
Spec: `docs/superpowers/specs/2026-06-12-ttlock-cloudbeds-middleware-design.md`
Status: **spec APPROVED. Phases 2+3 built; webhook built (Phase 4). TTLock auth
VALIDATED LIVE. lock-app Plans 2+3 DONE + property-first restructure DONE (OTP login,
Portfolio→Dashboard flow, property sidebar, top-bar profile + notification bell).**
RESUME HERE (2026-06-23): **Property-first restructure COMPLETE** (8-task plan,
`docs/superpowers/plans/2026-06-23-lock-app-property-first-restructure.md`). Shipped:
email-**OTP** login (6-digit code, replaces magic-link; code logged to console till
email delivery ships), **Portfolio** picker landing (`/portfolio`) → per-property
**Dashboard** (`/p/[id]/dashboard`, KPIs + "My Actions" feed, no zones), property-scoped
**flat sidebar** (Dashboard/Alerts/Rooms/Devices/Activity + ← Portfolio; Settings/Users
pinned bottom), **top bar** with profile menu (name/notification prefs/sign out; password
deferred) + in-app **notification bell** (unseen count from EventLog warning/failed;
delivery deferred to Alerts engine). Login white-on-white input bug fixed. 3 new pure
libs TDD (otp/dashboard/notifications); **65/65 tests pass**, typecheck+build green.
Smoke-tested live: OTP login → portfolio → dashboard renders seeded actions. Removed
unused PropertySwitcher. 9 commits this session.
NEXT SESSION — pick one: (1) **Plan 4** = alerts engine + crons (turns the bell real:
detection jobs + email delivery + notification-pref enforcement); (2) **create the
lock-app Vercel project** (Root Dir `lock-app/`, shared Neon `DATABASE_URL`) to deploy;
(3) **Plan 5 remainder** = Users/Roles/Settings UI + real OTP email (reuse client-portal
email.ts) + optional password auth.
Still LIVE-UNVERIFIED (blocks E2E, not dev): TTLock write paths need a registered lock
+ reachable `euapi.ttlock.com`; webhook needs a real Cloudbeds sample. Branch is 41
commits ahead of origin — NOT pushed.
TTLock auth root cause (reference): OAuth grant uses the lock-owning `lock2.ttlock.com`
account password, NOT the `euopen.ttlock.com` portal pw; API host `euapi.ttlock.com`.
Confirming `4ec9049d…` = `main` still needs Gerardo to register 1 test lock.
SECRET HYGIENE: `WebStayable123$` (euopen pw) + client_secret surfaced in chat; the
working lock2 pw stayed in gitignored `ttlock-test.ps1` only. Delete that file + rotate
when convenient.
Legend: 🟢 ready now · 🟡 needs an input · 🔴 blocked on Gerardo/on-site · P0 = critical path

### Phase 0 — Prereqs
- [~] 🔴 P0 Verify `client_id 4ec9049d…` is the **`main`** app — auth confirmed, but
      `lockCount:0` (no locks yet) so main-vs-old is UNVERIFIABLE until a lock is
      registered. Blocked on Gerardo registering 1 test lock → re-check lockCount.
- [x] 🟢 TTLock creds (use **lock2.ttlock.com** account password, NOT euopen portal pw)
- [~] 🟡 P0 Generate long random `WEBHOOK_SECRET` — DONE locally (256-bit base64url in
      `middleware/.env`, 2026-06-16). STILL NEEDED: add it to Vercel middleware project env.
- [x] 🟢 Confirm `admin@rentstayable.com` owns the locks + the app (it does; auth OK)

### Phase 1 — Infrastructure (remote)
- [x] 🟢 P0 Provision **Neon Postgres** via Vercel Marketplace (`stayable-locks`, 2026-06-16)
- [~] 🟡 Create 2 Vercel projects → Root Dirs `middleware/`, `lock-app/`
      **lock-app DONE 2026-06-23**: project `lock-app` (prj_y94ZneZEErOo6cCEh5PZFoummxC8,
      team stayable-admins-projects) deployed to prod via CLI from `lock-app/` dir.
      Prod URL: **https://lock-app-dusky.vercel.app**. middleware project still TODO.
- [~] 🟡 Connect the one Neon DB to both projects (shared `DATABASE_URL`)
      lock-app: DATABASE_URL + DATABASE_URL_UNPOOLED + JWT_SECRET set (Production). DB
      connectivity verified live (auth/request → 200). Preview-env vars NOT set yet.
      OPEN: prod login needs the OTP code from Vercel runtime logs until email is wired
      (Plan 4/5); CLI deploy is NOT Git-connected (no auto-deploy on push) — wire Git
      integration + Root Dir `lock-app/` in the dashboard if auto-deploys are wanted.

### Phase 2 — middleware: TTLock auth (validates creds) ⭐
- [x] 🟢 P0 Scaffold `middleware/` (Next 14 + TS) — typecheck + build pass
- [x] 🟢 P0 `lib/ttlock.ts` — token (MD5 password) + cache, listLocks, create/deletePasscode
- [x] 🟢 P0 `GET /api/ttlock-test` → returns auth status, uid, lockCount, isMainApp
- [x] 🟢 Deploy/run → hit `/api/ttlock-test` → `auth:success` on Vercel (2026-06-13)

### Phase 3 — Database (Prisma on Neon)
- [x] 🟢 P0 Schema: `LockMap`, `Passcode`, `EventLog` (`middleware/prisma/schema.prisma`)
      + `lib/db.ts` singleton; prisma generate + build pass. Committed (645bdb2).
- [x] 🟢 P0 Provision Neon (`stayable-locks`, Vercel→Storage). Strings pasted into
      `middleware/.env` by hand (Sensitive vars pull empty). `prisma db push` synced;
      3 tables verified live (LockMap/Passcode/EventLog, all empty). 2026-06-16.

### Phase 4 — middleware: webhook (core)
⚠️ DESIGN CORRECTED 2026-06-13 (verified vs Cloudbeds docs — build guide was wrong):
  - **Cloudbeds does NOT HMAC-sign webhooks.** No signature mechanism exists. Use a
    **secret URL token** instead: register endpoint as `/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>`
    and verify the token (constant-time compare). `lib/webhook-auth.ts` = token check, not HMAC.
  - **Webhook payload is THIN** — `reservation/created` carries `version, timestamp, event,
    propertyID, propertyID_str, reservationID, startDate, endDate`; `status_changed` adds
    `status`; `deleted` is just propertyID+reservationID. **NO roomID.**
  - → Handler MUST call Cloudbeds **`getReservation(propertyID, reservationID)`** to get the
    assigned room(s) → roomID. A reservation can span multiple rooms → multiple PINs.
  - → Therefore middleware needs the **per-property Cloudbeds keys** (the 8-account registry,
    like the MCP), NOT a single `CLOUDBEDS_ACCESS_TOKEN`. Mirror `CloudbedsRegistry`.
  - Cloudbeds retries failed webhooks 5× at 1-min intervals; endpoint must return 2XX fast.
  - Source: https://developers.cloudbeds.com/docs/webhooks-1
- [x] 🟢 P0 `lib/webhook-auth.ts` — secret URL-token verify (NOT HMAC), constant-time compare
- [x] 🟢 P0 Port `CloudbedsRegistry` + `getReservation`/`extractRoomIds` into `middleware/lib/cloudbeds.ts` (per-property keys)
- [x] 🟢 P0 `POST /api/cloudbeds-webhook` — verify token → parse event → classify intent →
      getReservation for room(s) → map (propertyID,roomID)→lockId → create/delete PIN →
      store `keyboardPwdId` → log. Idempotent (safe under Cloudbeds 5× retry). Orchestration
      in `lib/passcode-sync.ts`. **typecheck + build pass (2026-06-15).**
- [ ] 🟡 P0 Validate against a **real Cloudbeds webhook sample** once an endpoint is registered.
      OPEN ASSUMPTION to verify live: roomID is read from `getReservation` → `data.rooms[].roomID`
      (extraction isolated in `extractRoomIds`); adjust if the live shape differs.
- [ ] 🟡 Refine PIN validity window to property-timezone check-in/out times (v1 uses UTC
      day-bounds, generous on both ends — see `validityWindow` in `passcode-sync.ts`).

### Phase 5 — lock-app: management UI (parallel once DB exists)
- [x] 🟢 Read-surfaces plan (`2026-06-17-lock-app-read-surfaces.md`, Plan 2 of 5) — DONE
      2026-06-17. App shell (hybrid nav + property switcher, permission-gated), Overview
      portfolio cards, Rooms grid (occupancy/health/masked code + search/filter), Devices
      inventory, Activity Log (search/filter + CSV export, amber/red tint). 4 pure view-model
      libs (properties/rooms/overview/activity) TDD — 32 tests pass. Dev seed (2 properties,
      super_admin user). typecheck/build green. NEXT: Plan 3 (code actions) or create the
      lock-app Vercel project to deploy.
- [x] 🟢 Foundation plan (`2026-06-16-lock-app-foundation.md`) — DONE 2026-06-16. Scaffolded
      Next 14 + TS + Tailwind; superset Prisma schema pushed to shared Neon (User/Role/
      Session/MagicLink/PropertyGroup/RoomState/TtlockToken + lock-health/Passcode.type
      mirrored to middleware); permission catalog + hasPermission (TDD, 5/5); magic-link
      auth (role-aware session) + RBAC helpers; 3 roles seeded; login page + auth routes
      (email stubbed → Plan 5). typecheck/build/tests pass. 9 commits.
- [x] 🟢 Admin code actions (Plan 3, 2026-06-20) — Door/Room detail page; guest
      reveal/revoke/manual, staff backup reveal/rotate (permanent code), sync-from-lock
      reconcile, LockMap CRUD; all permission-gated + audit-logged. Pure libs TDD
      (passcodes/reconcile/audit/door-detail). TTLock client ported. typecheck/build/tests
      green. LIVE-UNVERIFIED: needs a registered lock + reachable euapi.ttlock.com.
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
