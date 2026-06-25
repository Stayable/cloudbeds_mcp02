# Lock-app — surface remaining TTLock capabilities

**Date:** 2026-06-25
**Status:** Approved (design)
**Author:** brainstorming session (bke@rise8companies.com)

## Goal

Fill the gap between what the lock-app dashboard exposes today and the TTLock
v3 capabilities that are operationally useful for Stayable. Add **live lock
health**, **physical access logs**, and **change-PIN + auto-lock settings** to
the existing per-property/per-room UI — without a separate "lock control" area.

### Explicitly out of scope
- **Remote unlock / lock** (`lock/unlock`, `lock/lock`) — high liability, deferred.
- **IC cards / fingerprints** — Stayable's flow is keypad PIN only.
- **Full lock-settings surface** — only **auto-lock time** is included.

## Context — what already exists

The lock-app (`lock-app/`) already implements, all RBAC-gated and audit-logged:

- **Writes:** generate manual guest PIN (period), reveal/revoke guest PIN,
  reveal/rotate staff backup PIN (permanent), reconcile DB↔lock (`syncFromLock`),
  create/edit/delete room→lock mapping.
- **Reads:** per-property dashboard, devices, rooms, room detail, activity
  (staff audit), alerts.

The TTLock client already has: `getTTLockToken`, `listLocks`, `createPasscode`,
`deletePasscode`, `listPasscodes`. This work extends that client and the room
detail page; it does **not** restructure the app.

## Architecture decisions

1. **Per-room, on-demand now; sync-ready for later.** Health and access logs are
   fetched live from TTLock when an operator opens a specific room's detail page
   (one lock = one fast call). No property-wide live fan-out (that would be brutal
   at ~1,450 locks). The TypeScript interfaces (`LockHealth`, `AccessRecord`) are
   defined as the **shared contract** a future background-sync cron will populate
   into Prisma tables, so adding sync later requires no rework of the UI or mappers.
2. **Extend, don't fork.** New controls live on the existing room detail page and
   in `actions.ts`; account-wide gateway health goes on the existing devices page.
3. **Graceful degradation.** Gateway-dependent calls (`getOpenState`, access log)
   are caught and rendered as "unavailable — no gateway" instead of failing the page.
4. **Client parity.** `lock-app/src/lib/ttlock.ts` and `middleware/lib/ttlock.ts`
   are deliberate duplicates and must stay identical. The read helpers were added
   to the middleware copy first this session; this work mirrors them into lock-app
   and adds the two write helpers to both.

## Components

### 1. TTLock client (`lock-app/src/lib/ttlock.ts`, mirrored to `middleware/lib/ttlock.ts`)
New functions:
- **Reads:** `getLockDetail(lockId)`, `getOpenState(lockId)` (gateway required;
  state 0=locked,1=unlocked,2=unknown), `listGateways()`, `listGatewaysForLock(lockId)`,
  `listLockRecords(lockId, startDate, endDate, pageNo, pageSize)`.
- **Writes:** `changePasscode({ lockId, keyboardPwdId, newPasscode })`
  (`/v3/keyboardPwd/change`, `changeType=2` via gateway), `setAutoLockTime({ lockId, seconds })`
  (`/v3/lock/setAutoLockTime` — **verify path against TTLock docs before trusting live**).

All follow the existing `postForm` + `assertOk` pattern. The two copies must be
byte-identical for the shared functions.

### 2. `lib/lock-health.ts`
- `getLockHealth(lockId): Promise<LockHealth>` — combines `getLockDetail` (battery,
  `featureValue`, model, firmware) + `listGatewaysForLock` (reachability) +
  `getOpenState` (graceful: `state: "unavailable"` when no gateway).
- `decodeFeatures(featureValue: number): LockFeatures` — pure bitmask decoder
  (passcode / IC card / fingerprint / remote-unlock / gateway / audit support).
  **Unit-tested.**
- `LockHealth` interface = the shared contract for the future sync table.

### 3. `lib/access-log.ts`
- `getAccessLog(lockId, range): Promise<AccessRecord[]>` — wraps `listLockRecords`,
  normalizes `recordType` → human label + `success` flag + actor.
- Pure normalizer `normalizeRecord(raw): AccessRecord` — **unit-tested.**
- `AccessRecord` interface = the shared contract for the future sync table.

### 4. Writes in room `actions.ts`
- `changeGuestPin(formData)` — `requirePermission("passcode.change", propertyId)`;
  calls `changePasscode`, updates the DB `passcode.pin` (keeps `keyboardPwdId`),
  audits masked before→after. Validates 4–9 digits.
- `setLockAutoLock(formData)` — `requirePermission("lock.settings.edit", propertyId)`;
  calls `setAutoLockTime`, audits the new value.

### 5. UI
- **Room detail page** (`p/[propertyId]/rooms/[roomId]/page.tsx`):
  - **Health card:** battery %, online dot, lock state, gateway, refresh button.
  - **Access-log list:** recent unlocks with a range filter (default last 7 days).
  - **Change-PIN control** on the active code.
  - **Auto-lock setting** input (seconds; 0 = off).
- **Devices page:** account-wide gateway health list from `listGateways`.

### 6. RBAC (`lib/rbac.ts`, `lib/permissions.ts`)
New permissions, mapped to roles consistent with existing grants:
- Reads: `lock.health.view`, `access_log.view`.
- Writes: `passcode.change`, `lock.settings.edit`.

## Future sync (documented, NOT built in this phase)
Prisma `LockHealth` and `AccessRecord` tables matching the interfaces above; a
middleware cron calls the same `getLockHealth` / `getAccessLog` functions and
writes those rows; UI reads DB-first and falls back to live. Today's interfaces
are designed so this drops in without changing the mappers or UI.

## Error handling
- Gateway-dependent calls caught per-call; the page renders partial health with
  an "unavailable — no gateway" note rather than erroring.
- `changePasscode` / `setAutoLockTime` failures surface to the operator and are
  audited as failed outcomes.
- On-demand single-lock fetch stays within TTLock rate limits.

## Testing
- vitest unit tests (matching existing `*.test.ts` convention) for:
  `decodeFeatures`, `normalizeRecord` (access-log), PIN validation for `changeGuestPin`.
- TTLock network calls mocked; no live calls in tests.

## Verification
- `npm run typecheck` / `npm test` in `lock-app/` (and `middleware/` for the
  mirrored client).
- Manual: deploy, open a real room's detail page against the live lock Gerardo
  registered; confirm battery/state/access-log render and change-PIN works.
