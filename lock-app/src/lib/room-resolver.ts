/**
 * Resolve a human room NUMBER (the token from a lock name, e.g. "292") to the
 * Cloudbeds roomID (e.g. "405758-102"). This is the fix for the onboarding↔check-in
 * mismatch: the discovery sync / Unassigned-assign parse a lock name into a room
 * number, but the check-in webhook matches on the Cloudbeds roomID. Storing the
 * roomID here makes both agree, and makes re-running Sync non-destructive.
 *
 * The pure index/lookup is unit-tested; loadRoomIndex is thin Cloudbeds glue.
 */
import { CloudbedsRegistry, listRooms, type CloudbedsRoom } from "./cloudbeds";

export interface RoomIndex {
  /** roomName (room number, trimmed) → Cloudbeds roomID, for unambiguous names. */
  byName: Map<string, string>;
  /** Cloudbeds roomID → roomName (room number). roomIDs are unique within a property. */
  byId: Map<string, string>;
  /** Room numbers that appear on more than one room — never auto-resolved. */
  ambiguous: Set<string>;
}

/**
 * Build a roomName→roomID index from a property's rooms. A room number that maps
 * to two different roomIDs is marked ambiguous (and will not be resolved) so we
 * never silently pick the wrong door.
 */
export function buildRoomIndex(rooms: CloudbedsRoom[]): RoomIndex {
  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const r of rooms) {
    const name = (r.roomName ?? "").trim();
    const id = (r.roomID ?? "").trim();
    if (!name || !id) continue;
    byId.set(id, name);
    const existing = byName.get(name);
    if (existing && existing !== id) {
      ambiguous.add(name);
    } else {
      byName.set(name, id);
    }
  }
  return { byName, byId, ambiguous };
}

/**
 * Resolve a room number against an index. Returns the Cloudbeds roomID, or null
 * if the number is unknown or ambiguous (caller must not write a guess).
 */
export function resolveFromIndex(index: RoomIndex, roomNumber: string): string | null {
  const name = roomNumber.trim();
  if (!name || index.ambiguous.has(name)) return null;
  return index.byName.get(name) ?? null;
}

/**
 * Reverse of resolveFromIndex: resolve a Cloudbeds roomID to its room number,
 * confirming the roomID actually belongs to this property. Used when the assign
 * UI submits a roomID chosen from a dropdown — the server re-derives the room
 * number from Cloudbeds rather than trusting the client's label, and rejects any
 * roomID that isn't a real room for the property. Returns null if unknown.
 */
export function resolveNameFromId(index: RoomIndex, roomId: string): string | null {
  const id = roomId.trim();
  if (!id) return null;
  return index.byId.get(id) ?? null;
}

/**
 * Load and index a property's rooms from Cloudbeds. Returns null if no key is
 * configured for the property (caller skips resolution rather than overwriting a
 * good mapping with a wrong one). Throws only on an actual API failure.
 */
export async function loadRoomIndex(
  registry: CloudbedsRegistry,
  propertyId: string,
): Promise<RoomIndex | null> {
  const rooms = await listRooms(registry, propertyId);
  if (rooms === null) return null; // no key for this property
  return buildRoomIndex(rooms);
}

/**
 * A per-property index cache so a sync over many locks fetches each property's
 * rooms at most once. `null` is cached too (no key / load attempted once).
 */
export class RoomIndexCache {
  private readonly cache = new Map<string, Promise<RoomIndex | null>>();
  constructor(private readonly registry: CloudbedsRegistry) {}

  get(propertyId: string): Promise<RoomIndex | null> {
    let p = this.cache.get(propertyId);
    if (!p) {
      p = loadRoomIndex(this.registry, propertyId);
      this.cache.set(propertyId, p);
    }
    return p;
  }
}
