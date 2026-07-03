/**
 * Naming for backup PINs. A backup slot carries a human LABEL (the descriptive
 * part, e.g. "Maintenance"); what we show in the app and write to TTLock is the
 * FULL NAME `<ABBR>-<label>` (e.g. "LL-Maintenance"), so a code is recognizable
 * per-property at a glance — matching the existing `<ABBR>-<room>` lock-naming
 * convention. Pure + dependency-free so it's trivially unit-tested.
 */

/** Max length of the descriptive label part, so `<ABBR>-<label>` fits TTLock's name field. */
export const MAX_LABEL_LEN = 20;

/** The label part for a backup slot: a trimmed custom name, else the default. */
export function backupCodeLabel(slot: number, custom?: string | null): string {
  const c = custom?.trim();
  return c ? c : `Backup ${slot}`;
}

/** Full display / TTLock name: `<prefix>-<label>`. Prefix omitted when blank. */
export function fullCodeName(prefix: string, label: string): string {
  return prefix ? `${prefix}-${label}` : label;
}

/**
 * The recognizable prefix for a room's codes: `<ABBR><roomNumber>` (e.g. "LL231"),
 * so a code reads "LL231-Maintenance" — property + room + purpose at a glance.
 * Falls back to just `<ABBR>` when the room number is unknown, and to "" when even
 * the abbr is blank.
 */
export function roomCodePrefix(abbr: string, roomNumber?: string | null): string {
  const n = roomNumber?.trim();
  if (!abbr) return "";
  return n ? `${abbr}${n}` : abbr;
}

/**
 * Normalize a user-typed label: trim, collapse internal whitespace, strip
 * characters outside a safe set, and cap length. Returns "" for an all-whitespace
 * or fully-stripped input — the caller treats "" as "reset to the default label".
 */
export function sanitizeLabel(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9 &/#-]/g, "") // keep letters, digits, space, and a few separators
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LEN)
    .trim();
}
