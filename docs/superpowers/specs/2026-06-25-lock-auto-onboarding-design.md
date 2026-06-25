# Lock auto-onboarding — discovery sync + naming convention + unassigned queue

**Date:** 2026-06-25
**Status:** Approved (design) — user said "build the sync and unmap it"
**Author:** brainstorming session (bke@rise8companies.com)

## Goal

Onboard locks into the lock-app at scale (~1,450 across 8 properties, one TTLock
account) without manually pasting each `lockId`. A discovery sync reads every
lock from TTLock and:
- **Name matches the convention `<ABBR>-<room>`** → auto-map to that property+room.
- **Name doesn't match** → drop into an **Unassigned queue** for one-click manual
  assignment.

Renaming a lock in the TTLock app to follow the convention makes the next sync
move it out of the queue onto the right property automatically.

## Why this also settles "one account vs per-property accounts"

Stayable uses **one** TTLock account for all 8 properties (existing design). The
naming convention is the mechanism that lets one account serve every property —
the lock name encodes the property. So **no per-property TTLock accounts/sub-
accounts are needed.** (Cloudbeds remains 8 separate accounts — that's PMS
billing, unaffected by any TTLock naming scheme.)

## Naming convention

`<ABBR>-<room>`, e.g. `KE-105`. ABBR is case-insensitive; room is the token after
the first hyphen (trimmed, non-empty). Abbreviation table (added to `PROPERTIES`):

| Property | Cloudbeds ID | abbr |
|----------|-------------|------|
| Kissimmee East | 210986 | KE |
| Kissimmee West | 210969 | KW |
| Orlando OBT | 210971 | OR |
| Lakeland | 210972 | LL |
| Jacksonville North | 206628 | JN |
| Jacksonville West | 210987 | JW |
| St. Augustine | 208155 | SA |
| Davenport | 318197 | DV |

A name parses only if the part before the first hyphen is exactly one of these
abbreviations. `lobby-HVAC unit room` → no match → queue.

## Architecture decisions

1. **roomId = the room token from the name (v1).** lock-app has no Cloudbeds
   client, so we do NOT resolve the room name to the Cloudbeds room ID here.
   `lockMap.roomId` gets the literal token (`105`). **Known limitation:** the
   Cloudbeds webhook keys passcodes by Cloudbeds room ID (`407869-2`), so
   auto-PIN-on-booking will not match until a reconciliation step (adding
   Cloudbeds room lookup to lock-app) is built. Documented as a follow-up; it
   does not block the property-attribution test.
2. **Two tables, clear roles.** `lockMap` stays the authoritative mapping that
   drives PIN ops. A new `UnassignedLock` table holds discovered locks that did
   not parse and are not already mapped — i.e. the queue.
3. **Idempotent sync, safe to re-run.** Re-running never duplicates: parseable
   locks upsert into `lockMap` (and are removed from the queue); unparseable,
   unmapped locks upsert into `UnassignedLock`. Already-mapped locks (e.g. a
   manually mapped lock) are never pushed into the queue.
4. **Manual trigger now, cron later.** A "Run sync" admin action runs discovery
   on demand. A scheduled cron is the same function on a timer (future).

## Components

### 1. `src/lib/property-codes.ts` (+ `abbr` on `PROPERTIES`)
- Add `abbr: string` to each `Property` in `properties.ts`.
- `parseLockName(name: string): { propertyId: string; room: string } | null` —
  pure, **unit-tested**: valid abbr → ids; unknown abbr / no hyphen / empty room → null.

### 2. Prisma `UnassignedLock`
```
model UnassignedLock {
  lockId       BigInt   @id
  name         String
  battery      Int?
  online       Boolean  @default(true)
  lastSeen     DateTime?
  discoveredAt DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### 3. `src/lib/lock-sync.ts`
- `syncDiscoveredLocks(): Promise<SyncSummary>` — calls `listLocks()` (paginated),
  then for each lock applies `classifyLock` (pure, **unit-tested**): returns
  `{ kind: "map", propertyId, room } | { kind: "queue" }` given the name + whether
  it's already in `lockMap`. The impure `syncDiscoveredLocks` applies the result:
  upsert `lockMap` or upsert `UnassignedLock`, and clear the queue row when a
  lock becomes mapped. Returns counts `{ mapped, queued, total }`.

### 4. Server action + RBAC
- `runLockSync()` in an admin actions file — `requirePermission("locks.sync_discovery")`,
  calls `syncDiscoveredLocks`, audits the summary, `revalidatePath`.
- `assignUnassignedLock(formData)` — `requirePermission("mapping.edit")`; creates
  the `lockMap` row from a queue entry (property + room chosen in UI) and deletes
  the queue row. Audited.
- New permission `locks.sync_discovery` added to `rbac.ts`/`permissions.ts`
  (granted to manager + super_admin).

### 5. UI — `(app)/unassigned/page.tsx`
- "Run discovery sync" button (calls `runLockSync`).
- Table of `UnassignedLock` rows: name, lockId, battery, last seen, + an inline
  assign form (property dropdown from `PROPERTIES`, room text input → `assignUnassignedLock`).
- Link in the sidebar/portfolio for admins.

## Error handling
- `listLocks` failure surfaces to the operator; partial per-lock failures are
  collected and reported in the summary without aborting the whole run.
- Re-running after a TTLock rename correctly moves a lock queue→mapped.

## Testing
- vitest unit tests (existing convention): `parseLockName` (valid/invalid),
  `classifyLock` (map vs queue, already-mapped short-circuit). TTLock/DB mocked.

## The trial test this enables
1. Build sync + queue (this spec). **Un-map the trial lock** (`27083179`,
   currently `210986 / TEST-LOBBY`) so it starts unmapped.
2. Run sync → lock's current name (`lobby-HVAC…`) doesn't parse → appears in the
   Unassigned queue.
3. Rename the lock to `KE-105` in the TTLock app.
4. Run sync → parses → `lockMap (210986, "105")` → leaves the queue, shows under
   Kissimmee East. ✅

## Verification
- `npm run typecheck` / `npm test` in `lock-app/`.
- `npx prisma db push` to add `UnassignedLock` (Neon reachable from sandbox).
- Live: deploy, run the sync, confirm the queue→rename→map loop.
