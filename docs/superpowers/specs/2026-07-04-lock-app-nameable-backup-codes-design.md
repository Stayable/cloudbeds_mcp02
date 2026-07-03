# Lock-App — Nameable Backup Codes (`<ABBR>-<name>`)

**Date:** 2026-07-04
**Status:** Design — awaiting BK review

## Problem

Each lock has 5 permanent staff **backup PINs**, today labeled `Backup 1`…`Backup 5`
in both the lock-app UI and the TTLock account (`keyboardPwdName`). Those labels
are generic — in the TTLock account you can't tell which property a code belongs
to or what it's for. BK wants staff to be able to **rename** a backup code (via a
pencil/edit affordance) and have it show as **`<ABBR>-<name>`** (e.g.
`LL-Maintenance`) in **both** the app and TTLock, for at-a-glance recognition.

## Decisions

- **Auto-prefix.** Staff type only the descriptive part (`Maintenance`); the app
  prepends the property abbreviation from `PROPERTIES` (`LL` for Lakeland),
  matching the existing `<ABBR>-<room>` lock-naming convention. Keeps prefixes
  consistent (no `LL` vs `Lakeland-` drift).
- **Backup codes only.** Guest codes stay auto-named `Res <id>`, manual codes
  `Manual`. Guest automation is untouched.
- **Name carries across a rotate.** The label describes the slot's purpose
  ("Maintenance"), not the digits, so rotating the PIN keeps the name.
- **Permission:** reuse `backup_code.rotate` (managing a backup code already
  requires it). No new permission.
- **Fail-closed on TTLock.** Rename TTLock first; only persist the DB label if it
  succeeds, so the app and TTLock never disagree.

## Data model

Add one nullable column to `Passcode` (lock-app schema):
```prisma
label String?   // backup codes: descriptive name part (no prefix), e.g. "Maintenance". null → default "Backup {slot}"
```
Backward-compatible: existing rows are null and render as today's default. Applied
to prod Neon via `prisma db push` (additive, no data change).

## Components

### New: `lock-app/src/lib/code-naming.ts` (pure, TDD)
```ts
export function backupCodeLabel(slot: number, custom?: string | null): string
  // custom?.trim() || `Backup ${slot}`
export function fullCodeName(abbr: string, label: string): string
  // `${abbr}-${label}`
export function sanitizeLabel(raw: string): string
  // trim, collapse internal whitespace, strip chars outside [A-Za-z0-9 &/#-],
  // cap at MAX_LABEL_LEN (20). May return "" (caller treats "" as reset-to-default).
```

### Changed: `lock-app/src/lib/ttlock.ts`
`renamePasscode({ lockId, keyboardPwdId, name })` → `POST /v3/keyboardPwd/rename`
with `clientId, accessToken, lockId, keyboardPwdId, keyboardPwdName, changeType: 2, date`.
⚠️ VERIFY LIVE: exact path/params against TTLock docs (same caution as
`listPasscodes`). Passcode names are cloud metadata, so this should not require
the lock to be online.

### Changed: `lock-app/src/lib/backup-codes.ts`
`generateBackupCodesForRoom` names each new code
`fullCodeName(abbr, backupCodeLabel(slot))` = `LL-Backup 1`. Derives `abbr` from
`getProperty(propertyId)` (falls back to no prefix if the property is unknown).

### Changed: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts`
- `rotateBackupCode`: read the slot's current `label` from the old row, carry it
  onto the new code's TTLock name and the new `Passcode.label`.
- New `renameBackupCode(propertyId, roomId, slot, rawLabel)`:
  requirePermission `backup_code.rotate` → find the slot's active code (none →
  friendly error) → `sanitizeLabel` → `renamePasscode` in TTLock (on failure,
  `mapActionError`, DB unchanged) → update `Passcode.label` → audit
  `backup_code_renamed` (before/after label) → revalidate. Empty sanitized label
  resets to the default `Backup {slot}` (TTLock name `LL-Backup {slot}`).

### Changed: `lock-app/src/lib/door-detail.ts`
Add `label?: string | null` to `PasscodeInput` and `CodeRow`; `toCodeRow` passes
it through so the page can display each slot's name.

### Changed: room detail `page.tsx` + new `BackupNameEditor.tsx` (client)
- Map `label: c.label` into the passcode rows fed to `splitCodes`.
- Replace the fixed `Backup {slot}` label with `<BackupNameEditor>`: shows
  `<ABBR>-<label>` and, when `can(backup_code.rotate)` and a code exists, a pencil
  toggle revealing an inline field (fixed `LL-` prefix shown; input is the name
  part only) + Save, wired to `renameBackupCode` via the existing `ActionForm`
  contract. Empty slots show the plain default, no pencil.

No change to reveal/rotate behavior, guest/manual codes, or colors.

## Data flow

Rename is app-initiated: pencil → inline field → `renameBackupCode` server action
→ TTLock `keyboardPwd/rename` + DB `label` update → page revalidates. Create/rotate
set the TTLock name at creation. No new DB reads on the dashboard/room pages beyond
selecting the existing rows (now including `label`).

## Error handling / edge cases

- No active code in the slot → "Create a code in this slot first." (can't name nothing).
- TTLock rename fails (offline/endpoint) → error surfaced, DB label unchanged
  (app and TTLock stay consistent).
- Empty/whitespace name → resets to default `Backup {slot}`.
- Unknown property abbr → no prefix (label shown/sent without `-`).
- Legacy backup rows (`backupSlot` null → slot 1, `label` null) → default label.

## Testing

`code-naming.test.ts`:
- `backupCodeLabel`: default for null/empty custom; trims a custom value.
- `fullCodeName`: `LL` + `Maintenance` → `LL-Maintenance`.
- `sanitizeLabel`: trims, collapses spaces, strips disallowed chars, caps length,
  returns "" for all-whitespace.

`door-detail.test.ts`: a backup row's `label` is carried onto its `CodeRow`.

## Out of scope
- Naming guest or manual codes.
- A bulk "sync all names to TTLock" job (create/rotate already set names; rename
  fixes individual ones).
- Per-property custom prefixes beyond the existing `abbr`.
