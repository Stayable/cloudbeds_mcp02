/**
 * Physical zone (building) grouping for a property's rooms. Lakeland is laid out
 * as four separate buildings (see `Lakeland Property Map.pdf`); on-site staff
 * think in buildings, not one flat grid. This is a pure regrouping of the same
 * room chips the Dashboard already builds — no new DB/Cloudbeds reads.
 *
 * Zones are keyed by ROOM NUMBER RANGES (not an explicit room list) so the view
 * is robust: only rooms that actually exist in the inventory render, and
 * closed/reno rooms still appear with their normal status color. Extend to
 * another property by adding its building→ranges to ZONE_CONFIG — no code change.
 */
import type { RoomChip } from "./rooms";

interface Zone {
  name: string;
  /** Inclusive [low, high] room-number ranges belonging to this building. */
  ranges: [number, number][];
}

/** propertyId (real Cloudbeds ID) → building layout. Lakeland (210972) only. */
const ZONE_CONFIG: Record<string, Zone[]> = {
  "210972": [
    { name: "Building A", ranges: [[100, 123], [200, 223]] },
    { name: "Building B", ranges: [[130, 157], [230, 257]] },
    { name: "Building C", ranges: [[160, 171], [260, 271]] },
    { name: "Building D", ranges: [[180, 195], [280, 295]] },
  ],
};

const OTHER = "Other";

export interface ZonedChips {
  zoneName: string;
  chips: RoomChip[];
  /** Rooms in this zone whose lock/occupancy status means a guest is present. */
  occupied: number;
  total: number;
}

/** True when the property has a defined building layout (drives the toggle). */
export function hasZones(propertyId: string): boolean {
  return propertyId in ZONE_CONFIG;
}

const OCCUPIED_STATUSES: ReadonlySet<RoomChip["status"]> = new Set([
  "ok",
  "warning",
  "issue",
  "occupied-no-lock",
]);

function inRange(n: number, ranges: [number, number][]): boolean {
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

/**
 * Group chips into their building. Chips keep their incoming order within a zone
 * (the caller already sorts them numerically). Zones are returned in config
 * order; a room whose label isn't a number in any range goes to "Other", which
 * is appended last and omitted when empty. Empty buildings are omitted too.
 * Returns [] for a property with no zone config.
 */
export function groupChipsByZone(propertyId: string, chips: RoomChip[]): ZonedChips[] {
  const zones = ZONE_CONFIG[propertyId];
  if (!zones) return [];

  const buckets = new Map<string, RoomChip[]>();
  for (const z of zones) buckets.set(z.name, []);
  buckets.set(OTHER, []);

  for (const ch of chips) {
    const n = Number.parseInt(ch.label, 10);
    const zone = Number.isNaN(n) ? undefined : zones.find((z) => inRange(n, z.ranges));
    buckets.get(zone ? zone.name : OTHER)!.push(ch);
  }

  const order = [...zones.map((z) => z.name), OTHER];
  return order
    .map((name) => {
      const zoneChips = buckets.get(name)!;
      return {
        zoneName: name,
        chips: zoneChips,
        total: zoneChips.length,
        occupied: zoneChips.filter((c) => OCCUPIED_STATUSES.has(c.status)).length,
      };
    })
    .filter((z) => z.chips.length > 0);
}
