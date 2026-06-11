# Stayable Smart-Lock Middleware + Lock Management App — Design

**Date:** 2026-06-12
**Author:** bke@rise8companies.com (remote dev) + Claude
**Status:** Draft for review
**Source spec:** `MiddlewareBuildGuide_RISE8_061126.md`

## Goal

Replace devicethread SmartAccess (~$4/lock/month across ~1,450 locks) with a
self-managed system that automatically creates and deletes guest TTLock PIN
codes from Cloudbeds reservation events, plus a UI to manage the room→lock
mapping and inspect/override codes.

Two independently deployable Vercel projects sharing one Neon Postgres database.

## Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Option 1 (hardened skeleton), per-property TTLock routing trimmed | Critical path is Gerardo's on-site lock registration, not code speed; build it correct while waiting. |
| Language | TypeScript | Matches `cloudbeds-mcp-server` / `client-portal`. |
| TTLock account model | **1 account, 1 Application = "Stayable Access — main"** | TTLock ties accounts to nothing; one app owns all locks. Two "old" apps (Jax West, Orlando) are abandoned. |
| Cloudbeds account model | **8 separate accounts** | Verified fact (CLAUDE.md). 8 webhook registrations → 1 endpoint. |
| Database | **Neon Postgres** via Vercel Marketplace, Prisma ORM | User's standard stack; serverless-native; reuses `client-portal` Prisma pattern. |
| Room→lock map | **DB table, not a static file** | The management app must edit mappings at runtime; the guide's `roomLockMap.js` cannot be edited live. |
| Shared code vs shared data | **Shared data (DB), not shared TS** | Vercel cannot import across sibling folders (same constraint as `cloudbeds-mcp` ↔ `cloudbeds-mcp-server`). The DB is the contract. |

## Architecture

```
cloudbeds_mcp02/
├── middleware/      Vercel project A — headless webhook service (no UI)
└── lock-app/        Vercel project B — role-based management UI
        │                    │
        └──── Neon Postgres ─┘   (the integration point; Prisma)
```

- **middleware/** reacts to Cloudbeds webhooks, calls TTLock, persists passcode
  records. No human UI.
- **lock-app/** is the human control panel: maintain mappings, view/override
  codes, audit log. Reads/writes the same DB; calls TTLock for manual actions.

### Why the asymmetry (1 TTLock vs 8 Cloudbeds) is correct
Cloudbeds accounts map to PMS billing/ownership — genuinely 8 subscriptions.
TTLock is an access-hardware vendor with no per-property constraint — one
account holds every lock. Lock IDs are globally unique within the TTLock account.

## Project A — `middleware/`

Next.js 14 App Router, TypeScript. Routes:

- `GET  /api/ttlock-test` — auth smoke test. Returns a token preview. Validatable
  remotely with no physical lock.
- `POST /api/cloudbeds-webhook` — the core. HMAC-verified.

`lib/ttlock.ts`:
- `getTTLockToken()` — OAuth password grant, MD5-hashed password, **token cached**
  in module/DB until expiry (TTLock tokens last ~90 days). No re-auth per event.
- `createPasscode({ lockId, passcode, startDate, endDate })`
- `deletePasscode({ lockId, keyboardPwdId })`

`lib/db.ts` — Prisma client (Neon).
`lib/webhook-auth.ts` — HMAC verify against `WEBHOOK_SECRET`.

### Webhook flow
1. Verify HMAC signature; reject forged requests (401).
2. Parse `event`, property identity, `roomId`, `check_in`, `check_out`, `reservationId`.
3. Look up `lock_map` by **(propertyId, roomId)** → `lockId`. If none, log
   `no_lock_mapped` and 200 (graceful — expected until locks are registered).
4. **created / modified / checked_in** → create PIN (random 6-digit), valid
   check-in 15:00 → check-out 11:00, store the returned `keyboardPwdId` +
   PIN in `passcode`.
5. **checked_out / cancelled** → look up stored `keyboardPwdId` for the
   reservation → `deletePasscode` → mark `passcode.status = revoked`.
6. Write every action to `event_log`.

### Determining which property a payload came from
Each of the 8 Cloudbeds accounts registers the webhook separately. Property
identity is resolved from the payload's property field (Cloudbeds includes
`propertyID`); to be validated against a real webhook sample during testing.
**Open item:** confirm the exact webhook payload shape from Cloudbeds docs/sample
before trusting field names — the guide's field names (`room_id`, `check_in`)
are assumptions.

## Project B — `lock-app/`

Next.js 14 App Router, TypeScript, Tailwind. Auth: reuse the magic-link / JWT
pattern from `client-portal` (`src/lib/auth.ts`). Role-based:

- **Admin (ops):**
  - CRUD the `lock_map` — (property, room) → lockId, alias.
  - View all active passcodes; manually revoke or issue a code.
  - Lock status / battery (TTLock query endpoint).
  - Event log viewer.
- **Field (Gerardo / front-desk), mobile-friendly:**
  - Look up a room → show the current guest PIN + validity window.
  - Mark a lock as registered (record its lockId against a room).
  - No destructive admin controls.

Both roles act through TTLock via shared `lib/ttlock.ts` logic (duplicated from
middleware per the no-sibling-import rule — kept in sync like the existing MCP
pair) and the shared Neon DB.

## Data Model (Prisma, Neon)

```prisma
model LockMap {
  id         String   @id @default(cuid())
  propertyId String          // real Cloudbeds propertyID, e.g. "210972"
  roomId     String          // Cloudbeds room id (unique only within a property)
  lockId     BigInt          // TTLock lock id (globally unique in the account)
  alias      String?
  createdAt  DateTime @default(now())
  @@unique([propertyId, roomId])
}

model Passcode {
  id            String   @id @default(cuid())
  reservationId String
  propertyId    String
  roomId        String
  lockId        BigInt
  keyboardPwdId BigInt          // REQUIRED to delete the PIN later
  pin           String
  startTs       BigInt          // unix ms
  endTs         BigInt
  status        String          // active | revoked | failed
  createdAt     DateTime @default(now())
  @@index([reservationId])
}

model EventLog {
  id         String   @id @default(cuid())
  source     String          // webhook | admin | field
  event      String
  propertyId String?
  roomId     String?
  lockId     BigInt?
  action     String          // passcode_created | passcode_revoked | no_lock_mapped | ...
  detail     Json?
  createdAt  DateTime @default(now())
}
```

## Security

- All secrets in `.env.local` (gitignored) locally + Vercel env vars in prod.
  Never committed, never in chat.
- Webhook authenticated via HMAC (`WEBHOOK_SECRET`); unsigned requests rejected.
- TTLock `password` is MD5-hashed for auth (TTLock requirement) and stored only
  as an env secret.
- PIN never returned in webhook HTTP responses in production.
- The guide's `client_id 4ec9049d…` must be verified to belong to the **main**
  app, not an "old" one, or API calls auth but see zero locks.

## Known Gaps / Later Phases (tracked, not built in v1)

- **Guest PIN delivery** — send PIN to guest via Cloudbeds messaging / SMS. High
  priority, but separate workstream.
- **Token refresh automation** — TTLock tokens expire ~90 days; v1 caches +
  re-fetches on expiry. A scheduled refresh + alerting is a follow-up.
- **TTLock plan tier** — upgrade required at 912+ locks; Stayable has ~1,450.
  Procurement/ops item, not code.
- **Error alerting** — email/Slack on webhook failure.

## External Dependencies (not code; gate go-live)

- **Gerardo (on-site):** register every lock to the **main** TTLock user account
  (ignore the two old apps); read Lock IDs; coordinate the devicethread→Stayable
  transfer for the 5 already-installed properties.
- **User (remote):** retrieve `main` app `client_secret` + account
  username/password; verify the `client_id` matches `main`; provision Neon and
  connect it to both Vercel projects.
- **Per-property go-live order** driven by lock availability (see guide's
  property table; Kissimmee West, Orlando OBT, Jax North not yet purchased).

## Out of Scope (YAGNI for v1)

- Per-property TTLock accounts/routing (one account model confirmed).
- Migrating the existing static-file room map (none exists yet — built straight
  into the DB).
- Touching `cloudbeds-mcp`, `cloudbeds-mcp-server`, or `client-portal` beyond
  reusing `client-portal`'s auth pattern by copy.

## Verification

- `middleware`: `npm run build` + `npm run typecheck`; `/api/ttlock-test`
  returns a token (remote, no lock); curl a fake webhook → `no_lock_mapped`.
- `lock-app`: `npm run build` + `npm run typecheck`; magic-link login; create a
  `lock_map` row; manual issue/revoke against one real test lock once Gerardo
  registers it.
- End-to-end: one real (property, room, lock) triple → live Cloudbeds reservation
  creates a PIN that opens the door; checkout deletes it.
```
