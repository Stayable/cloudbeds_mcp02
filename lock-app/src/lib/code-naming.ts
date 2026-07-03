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

/** Full display / TTLock name: `<ABBR>-<label>`. Abbr omitted when blank. */
export function fullCodeName(abbr: string, label: string): string {
  return abbr ? `${abbr}-${label}` : label;
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
