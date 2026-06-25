/**
 * Lock-naming convention parser for auto-onboarding.
 *
 * Field staff name each lock `<ABBR>-<room>` in the TTLock app (e.g. "KE-105").
 * The discovery sync uses this to map a lock to its property+room. A name that
 * doesn't conform returns null and the lock lands in the Unassigned queue.
 *
 * NOTE (v1): `room` is the literal token from the name (e.g. "105"), NOT the
 * Cloudbeds room ID. Reconciling that for webhook-driven PINs is a follow-up.
 */
import { PROPERTIES } from "./properties";

// abbr (uppercased) -> Cloudbeds propertyID
const ABBR_TO_PROPERTY = new Map(PROPERTIES.map((p) => [p.abbr.toUpperCase(), p.id]));
// Cloudbeds propertyID -> abbr
const PROPERTY_TO_ABBR = new Map(PROPERTIES.map((p) => [p.id, p.abbr]));

/**
 * Build the canonical lock name `<ABBR>-<room>` for a property + room, or null
 * if the property is unknown or the room is empty. Inverse of parseLockName.
 */
export function canonicalLockName(propertyId: string, room: string): string | null {
  const abbr = PROPERTY_TO_ABBR.get(propertyId);
  const trimmed = room.trim();
  if (!abbr || !trimmed) return null;
  return `${abbr}-${trimmed}`;
}

export interface ParsedLockName {
  propertyId: string;
  room: string;
}

/**
 * Parse `<ABBR>-<room>` into property + room, or null if it doesn't conform.
 * The abbreviation (before the first hyphen) is case-insensitive and must be a
 * known property code; the room is everything after the first hyphen, trimmed.
 */
export function parseLockName(name: string): ParsedLockName | null {
  const trimmed = name.trim();
  const hyphen = trimmed.indexOf("-");
  if (hyphen === -1) return null;

  const abbr = trimmed.slice(0, hyphen).trim().toUpperCase();
  const room = trimmed.slice(hyphen + 1).trim();
  if (!room) return null;

  const propertyId = ABBR_TO_PROPERTY.get(abbr);
  if (!propertyId) return null;

  return { propertyId, room };
}

/**
 * Best-guess room number from a lock's name, used to pre-fill the assign form in
 * the Unassigned queue (the operator can override). Returns the first run of
 * digits in the name (e.g. "Room# 239" → "239", "KE-105" → "105"), or "".
 */
export function guessRoomNumber(name: string): string {
  return name.match(/\d+/)?.[0] ?? "";
}

export type LockClassification =
  | { kind: "map"; propertyId: string; room: string }
  | { kind: "keep" }
  | { kind: "queue" };

/**
 * Decide what the discovery sync should do with one lock, given its name and
 * whether it is already in the room→lock map:
 *  - name conforms        → "map" (upsert the mapping; also handles a rename)
 *  - non-conforming + mapped   → "keep" (leave a manual mapping alone)
 *  - non-conforming + unmapped → "queue" (needs manual assignment)
 */
export function classifyLock(name: string, isMapped: boolean): LockClassification {
  const parsed = parseLockName(name);
  if (parsed) return { kind: "map", ...parsed };
  return isMapped ? { kind: "keep" } : { kind: "queue" };
}
