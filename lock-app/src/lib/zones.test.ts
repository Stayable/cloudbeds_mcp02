import { describe, it, expect } from "vitest";
import { hasZones, groupChipsByZone } from "./zones";
import type { RoomChip } from "./rooms";

const LAKELAND = "210972";

function chip(label: string, status: RoomChip["status"] = "vacant"): RoomChip {
  return { roomId: `id-${label}`, label, status, fault: null };
}

const KISSIMMEE_WEST = "210969"; // intentionally unzoned (odd/even interleaved wings)

describe("hasZones", () => {
  it("is true for every configured property", () => {
    for (const id of ["210972", "206628", "210971", "210986", "208155", "210987", "318197"]) {
      expect(hasZones(id)).toBe(true);
    }
  });
  it("is false for a property without a zone config", () => {
    expect(hasZones(KISSIMMEE_WEST)).toBe(false); // Kissimmee West — not range-partitionable
  });
});

describe("configured properties partition sample rooms", () => {
  // A representative room from each building of each configured property lands in
  // that building (not "Other") — guards against a bad range edit.
  const cases: Array<[string, Array<[string, string]>]> = [
    ["206628", [["Building A", "103"], ["Building B", "316"], ["Building C", "230"], ["Building D", "347"]]],
    ["210971", [["Building A", "1103"], ["Building B", "1243"], ["Building C", "2234"], ["Building D", "3102"]]],
    ["210986", [["Building A", "100"], ["Building B", "220"], ["Building C", "159"], ["Building D", "279"], ["Building E", "180"]]],
    ["208155", [["Building A", "155"], ["Building B", "101"], ["Building C", "273"], ["Building D", "120"]]],
    ["210987", [["Building A", "100"], ["Building B", "233"], ["Building C", "149"], ["Building D", "250"], ["Building E", "425"]]],
    ["318197", [["Building A", "140"], ["Building B", "282"]]],
  ];
  for (const [propertyId, expectations] of cases) {
    it(`assigns rooms correctly for ${propertyId}`, () => {
      const chipsIn = expectations.map(([, label]) => chip(label));
      const zones = groupChipsByZone(propertyId, chipsIn);
      expect(zones.some((z) => z.zoneName === "Other")).toBe(false);
      const zoneOf = (label: string) => zones.find((z) => z.chips.some((c) => c.label === label))?.zoneName;
      for (const [expectedZone, label] of expectations) {
        expect(zoneOf(label)).toBe(expectedZone);
      }
    });
  }
});

describe("groupChipsByZone (Lakeland)", () => {
  it("assigns rooms to the correct building by number", () => {
    const chips = [chip("100"), chip("130"), chip("165"), chip("190")];
    const zones = groupChipsByZone(LAKELAND, chips);
    const byName = Object.fromEntries(zones.map((z) => [z.zoneName, z.chips.map((c) => c.label)]));
    expect(byName["Building A"]).toEqual(["100"]);
    expect(byName["Building B"]).toEqual(["130"]);
    expect(byName["Building C"]).toEqual(["165"]);
    expect(byName["Building D"]).toEqual(["190"]);
  });

  it("places range boundaries in the right building", () => {
    const boundaries: Record<string, string[]> = {
      "Building A": ["100", "123", "200", "223"],
      "Building B": ["130", "157", "230", "257"],
      "Building C": ["160", "171", "260", "271"],
      "Building D": ["180", "195", "280", "295"],
    };
    for (const [zoneName, labels] of Object.entries(boundaries)) {
      const zones = groupChipsByZone(LAKELAND, labels.map((l) => chip(l)));
      const z = zones.find((z) => z.zoneName === zoneName);
      expect(z?.chips.map((c) => c.label).sort()).toEqual([...labels].sort());
    }
  });

  it("puts out-of-range and non-numeric labels in 'Other'", () => {
    const chips = [chip("125"), chip("159"), chip("LL-lobby")];
    const zones = groupChipsByZone(LAKELAND, chips);
    const other = zones.find((z) => z.zoneName === "Other");
    expect(other?.chips.map((c) => c.label).sort()).toEqual(["125", "159", "LL-lobby"]);
  });

  it("omits 'Other' when every room maps to a building", () => {
    const zones = groupChipsByZone(LAKELAND, [chip("100"), chip("290")]);
    expect(zones.some((z) => z.zoneName === "Other")).toBe(false);
  });

  it("omits empty buildings and returns zones in config order", () => {
    const zones = groupChipsByZone(LAKELAND, [chip("290"), chip("100")]);
    expect(zones.map((z) => z.zoneName)).toEqual(["Building A", "Building D"]);
  });

  it("counts occupied vs total per zone", () => {
    const chips = [
      chip("100", "ok"), // occupied
      chip("101", "issue"), // occupied (offline)
      chip("102", "occupied-no-lock"), // occupied
      chip("103", "vacant"), // not occupied
      chip("104", "no-lock"), // not occupied
    ];
    const zones = groupChipsByZone(LAKELAND, chips);
    const a = zones.find((z) => z.zoneName === "Building A")!;
    expect(a.total).toBe(5);
    expect(a.occupied).toBe(3);
  });

  it("returns no zones for a property without a config", () => {
    expect(groupChipsByZone(KISSIMMEE_WEST, [chip("100")])).toEqual([]);
  });
});
