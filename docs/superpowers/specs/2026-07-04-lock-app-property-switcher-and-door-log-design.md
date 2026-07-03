# Lock-App — Property Switcher + Per-Room Door Access Log

**Date:** 2026-07-04
**Status:** Design — awaiting BK review

Two independent, related improvements: faster property-to-property navigation, and
a per-room physical-access log that leverages the named backup codes for monitoring.

---

## Feature A — Property switcher in the sidebar

### Problem
Jumping between properties requires going back to Portfolio and picking one. BK
wants a dropdown that lists all properties for direct navigation, while keeping the
Portfolio link itself clickable.

### Design
- `app/(app)/layout.tsx` passes `userProperties(user)` (existing helper — scope-
  filtered `{id, name, abbr}[]`) to `Sidebar`.
- The "Portfolio" nav item becomes a row: the **label stays a `<Link href="/portfolio">`**
  (still navigates to Portfolio) plus a **chevron button** that toggles a collapsible
  list of the user's properties rendered beneath it.
- Each property row links to `/p/<id>/dashboard`; the current property (parsed from
  the path, same `pid` the sidebar already derives) is highlighted.
- Client-side `useState` toggle, initialized open when currently inside a property
  (`pid` set). No new data fetch, no new permission.
- If the user can see only one property, still list it (harmless) — no special case.

### Testing
Presentation-only (client component); covered by typecheck + build. No unit test.

---

## Feature B — Per-room door access log (live)

### Problem
The existing Activity log records staff **app actions** (code created/revealed/
rotated). It does NOT show **physical unlocks** — who actually opened the door.
With backup codes now named (`<ABBR>-<name>`), BK wants to see, per room, which code
opened the door and when — i.e. whether it was the guest or someone else. This is
the monitoring payoff of the code-renaming work.

### Data source
TTLock access records via `POST /v3/lockRecord/list` (per lock). Fetched **live**
per room view — cheap (one lock), immediate, no storage. No cron / DB table / fleet
view in this iteration (YAGNI); the classifier is pure so property-wide ingestion
can be added later without rework.

### Components

**`lib/ttlock.ts`** — new:
```ts
listLockRecords(lockId, opts?: { startDate?; endDate?; pageNo?; pageSize? }): Promise<{ list: LockRecord[] }>
```
`POST /v3/lockRecord/list` with `clientId, accessToken, lockId, startDate, endDate,
pageNo, pageSize, date`. Default window: last 14 days, pageNo 1, pageSize 100.
⚠️ VERIFY LIVE: path/params/response shape (same caution as `listPasscodes` /
`renamePasscode`). Expected record fields (adjust on live shape): `recordType`
(unlock method), `success` (1/0), `keyboardPwd` (digits, for passcode unlocks),
`lockDate` (epoch-ms), `username`.

**`lib/door-log.ts`** (pure, TDD):
```ts
type AccessCredential = "guest" | "backup" | "manual" | "other";
interface AccessRow { at: number; method: string; label: string; credential: AccessCredential; success: boolean }
classifyAccessRecord(rec, passcodes): AccessRow
buildAccessRows(recs, passcodes): AccessRow[]  // sorted newest-first
```
- Match `rec.keyboardPwd`/keyboardPwdId against the passcode rows (which carry
  `pin`, `keyboardPwdId`, `type`, `label`, `reservationId`). Label:
  - guest → `Guest (Res <reservationId>)`
  - backup → `<ABBR>-<label>` (default `Backup {slot}` when unnamed)
  - manual → `Manual code`
  - no match → `Other / unknown code`
- Non-passcode unlock (`recordType` = app/Bluetooth/fingerprint/card) → label by
  method (e.g. "App / Bluetooth"), credential `other`.
- `method` is a friendly string from a small `recordType` → label map (unknown
  types fall back to `Type <n>`).

**Room detail `page.tsx`** — new "Recent access" card:
- Gated by `activity.view` (monitoring).
- A try/catch loader (`lib/lock-record-loader.ts`) fetches the mapped lock's records
  and NEVER throws — returns `[]` on any error / when unmapped / no TTLock config.
- Classifies via `buildAccessRows` against the already-loaded `codes`, renders a
  compact list: **time (property-local, `property.timezone`) · label · method · ✓/✗**.
- Empty/error → "Access history unavailable" (subtle), matching the guest-card
  graceful-degrade pattern.

### Error handling / edge cases
- Unmapped room / no TTLock creds / API error → loader returns `[]` → "unavailable".
- A record whose code was since revoked still matches (Passcode rows persist with
  `status:revoked`), so recent history stays labelled.
- Backup label reset (null) → shows default `Backup {slot}` via existing helper.
- Failed unlock attempts (`success:0`) shown with ✗ (useful for "wrong code tried").

### Testing
`door-log.test.ts`: guest / backup(named) / manual / other classification by
keyboardPwd match; success vs failed flag; non-passcode method labelled `other`;
newest-first ordering.

---

## Out of scope
- Fleet-wide / property-wide door log, DB ingestion table, polling cron (later; the
  classifier is built to be reused).
- CSV export of access records (existing Activity export is separate).
- Real-time push of unlocks.
