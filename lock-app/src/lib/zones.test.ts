import { describe, it, expect } from "vitest";
import { hasZones, groupChipsByZone } from "./zones";
import type { RoomChip } from "./rooms";

const LAKELAND = "210972";

function chip(label: string, status: RoomChip["status"] = "vacant"): RoomChip {
  return { roomId: `id-${label}`, label, status, fault: null };
}

describe("hasZones", () => {
  it("is true for Lakeland", () => {
    expect(hasZones(LAKELAND)).toBe(true);
  });
  it("is false for a property without a zone config", () => {
    expect(hasZones("206628")).toBe(false); // Jacksonville North
  });
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
    expect(groupChipsByZone("206628", [chip("100")])).toEqual([]);
  });
});
