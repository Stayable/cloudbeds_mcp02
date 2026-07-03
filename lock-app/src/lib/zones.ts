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

/**
 * propertyId (real Cloudbeds ID) → building layout, read off each property's
 * floor map (see the *.pdf maps in the repo root). Buildings are keyed by
 * room-number RANGES. Where the map labels buildings we use those labels; where
 * it doesn't but the wings split cleanly by number, we assume A/B/… by wing.
 *
 * NOT listed here (intentionally): Kissimmee West (210969) — its wings interleave
 * odd/even room numbers within the same number band, so a range can't separate
 * them; it needs odd/even support before it can be zoned faithfully.
 */
const ZONE_CONFIG: Record<string, Zone[]> = {
  // Lakeland — map-labelled Buildings A–D.
  "210972": [
    { name: "Building A", ranges: [[100, 123], [200, 223]] },
    { name: "Building B", ranges: [[130, 157], [230, 257]] },
    { name: "Building C", ranges: [[160, 171], [260, 271]] },
    { name: "Building D", ranges: [[180, 195], [280, 295]] },
  ],
  // Jacksonville North — map-labelled Buildings A–D (floors 1xx/2xx/3xx).
  "206628": [
    { name: "Building A", ranges: [[103, 115], [200, 215], [301, 315]] },
    { name: "Building B", ranges: [[116, 122], [216, 223], [316, 323]] },
    { name: "Building C", ranges: [[125, 135], [224, 235], [324, 335]] },
    { name: "Building D", ranges: [[136, 147], [236, 247], [336, 347]] },
  ],
  // Orlando OBT — map-labelled Buildings A–D (4-digit rooms: 1xxx/2xxx/3xxx).
  "210971": [
    { name: "Building A", ranges: [[1103, 1123], [1202, 1223]] },
    { name: "Building B", ranges: [[1124, 1143], [1224, 1243]] },
    { name: "Building C", ranges: [[2101, 2234]] },
    { name: "Building D", ranges: [[3102, 3225]] },
  ],
  // Kissimmee East — map-labelled Buildings A–E (clean 20-room blocks).
  "210986": [
    { name: "Building A", ranges: [[100, 119], [200, 219]] },
    { name: "Building B", ranges: [[120, 139], [220, 239]] },
    { name: "Building C", ranges: [[140, 159], [240, 259]] },
    { name: "Building D", ranges: [[160, 179], [260, 279]] },
    { name: "Building E", ranges: [[180, 199], [280, 299]] },
  ],
  // St. Augustine — map-labelled Buildings A–D.
  "208155": [
    { name: "Building A", ranges: [[138, 155], [238, 255]] },
    { name: "Building B", ranges: [[101, 119], [201, 219]] },
    { name: "Building C", ranges: [[156, 173], [256, 273]] },
    { name: "Building D", ranges: [[120, 137], [220, 237]] },
  ],
  // Jacksonville West — unlabelled map; assumed A–E by physical wing.
  // A: SW wing · B: NW wing · C: SE wing · D: NE wing · E: centre (3xx/4xx).
  "210987": [
    { name: "Building A", ranges: [[100, 115], [200, 215]] },
    { name: "Building B", ranges: [[116, 133], [216, 233]] },
    { name: "Building C", ranges: [[134, 149], [234, 249]] },
    { name: "Building D", ranges: [[150, 167], [250, 267]] },
    { name: "Building E", ranges: [[300, 325], [400, 425]] },
  ],
  // Davenport — unlabelled map; assumed A/B by physical wing.
  // A: long lower wing · B: tall right wing.
  "318197": [
    { name: "Building A", ranges: [[103, 140], [201, 240]] },
    { name: "Building B", ranges: [[141, 182], [241, 282]] },
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
