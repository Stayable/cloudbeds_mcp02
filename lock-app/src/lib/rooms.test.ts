import { describe, it, expect } from "vitest";
import { maskPin, occupancyColor, toRoomTile, filterRoomTiles, roomChipStatus, roomChipFault, buildRoomChips, type RoomTileInput, type RoomChipInput } from "./rooms";

const base: RoomTileInput = {
  roomId: "101", alias: null, online: true, battery: 80,
  occupancyStatus: "free", guestName: null, checkoutDate: null, activePin: null,
};

describe("maskPin", () => {
  it("masks all but the last two digits", () => {
    expect(maskPin("123472")).toBe("••••72");
  });
  it("handles short pins without negative repeat", () => {
    expect(maskPin("72")).toBe("72");
  });
});

describe("occupancyColor", () => {
  it("maps occupancy to functional colors", () => {
    expect(occupancyColor("occupied")).toBe("red");
    expect(occupancyColor("reserved")).toBe("amber");
    expect(occupancyColor("free")).toBe("green");
  });
});

describe("toRoomTile", () => {
  it("flags low battery under 20%", () => {
    expect(toRoomTile({ ...base, battery: 15 }).batteryLow).toBe(true);
    expect(toRoomTile({ ...base, battery: 25 }).batteryLow).toBe(false);
  });
  it("masks an active code and passes guest fields through", () => {
    const t = toRoomTile({ ...base, occupancyStatus: "occupied", guestName: "A. Guest", checkoutDate: "2026-06-20", activePin: "445590" });
    expect(t.maskedCode).toBe("••••90");
    expect(t.occupancyColor).toBe("red");
    expect(t.guestName).toBe("A. Guest");
  });
  it("prefers alias, then room number, then the raw room id for the label", () => {
    expect(toRoomTile({ ...base, alias: "Suite A", roomName: "101" }).label).toBe("Suite A");
    expect(toRoomTile({ ...base, roomId: "405758-102", roomName: "292" }).label).toBe("292");
    expect(toRoomTile({ ...base, roomId: "405758-102" }).label).toBe("405758-102");
  });
  it("has no masked code when there is no active pin", () => {
    expect(toRoomTile(base).maskedCode).toBeNull();
  });
  it("defaults mapped to true, and carries an explicit false through", () => {
    expect(toRoomTile(base).mapped).toBe(true);
    expect(toRoomTile({ ...base, mapped: false }).mapped).toBe(false);
  });
});

describe("roomChipStatus (occupancy-first portfolio colors)", () => {
  it("is black (no-lock) for an unmapped VACANT room", () => {
    expect(roomChipStatus({ mapped: false, occupied: false, online: false, batteryLow: true })).toBe("no-lock");
  });
  it("is light blue (occupied-no-lock) for an unmapped room that is occupied right now", () => {
    expect(roomChipStatus({ mapped: false, occupied: true, online: false, batteryLow: true })).toBe("occupied-no-lock");
  });
  it("is grey (vacant) for any mapped+vacant room, even when the lock is offline or low", () => {
    expect(roomChipStatus({ mapped: true, occupied: false, online: true, batteryLow: false })).toBe("vacant");
    expect(roomChipStatus({ mapped: true, occupied: false, online: false, batteryLow: true })).toBe("vacant");
  });
  it("surfaces lock health only when occupied: offline→issue, low→warning, else ok", () => {
    expect(roomChipStatus({ mapped: true, occupied: true, online: false, batteryLow: false })).toBe("issue");
    expect(roomChipStatus({ mapped: true, occupied: true, online: true, batteryLow: true })).toBe("warning");
    expect(roomChipStatus({ mapped: true, occupied: true, online: true, batteryLow: false })).toBe("ok");
  });
});

describe("roomChipFault (lock-health ring, occupancy-independent)", () => {
  it("is null for an unmapped room or a healthy lock", () => {
    expect(roomChipFault({ mapped: false, online: false, batteryLow: true })).toBeNull();
    expect(roomChipFault({ mapped: true, online: true, batteryLow: false })).toBeNull();
  });
  it("rings offline (issue) and low battery (warning) regardless of occupancy", () => {
    expect(roomChipFault({ mapped: true, online: false, batteryLow: false })).toBe("issue");
    expect(roomChipFault({ mapped: true, online: true, batteryLow: true })).toBe("warning");
  });
});

describe("buildRoomChips", () => {
  const chip = (o: Partial<RoomChipInput>): RoomChipInput => ({
    roomId: "x", mapped: true, online: true, battery: 90, occupancyStatus: "free", ...o,
  });
  it("labels by room number, sorts numerically, and maps status", () => {
    const chips = buildRoomChips([
      chip({ roomId: "405758-12", roomName: "12", occupancyStatus: "occupied", online: false }),
      chip({ roomId: "405758-2", roomName: "2", occupancyStatus: "free" }),
      chip({ roomId: "405758-9", roomName: "9", mapped: false }),
    ]);
    expect(chips.map((c) => c.label)).toEqual(["2", "9", "12"]);
    expect(chips.map((c) => c.status)).toEqual(["vacant", "no-lock", "issue"]);
  });
  it("rings a VACANT room whose lock is offline (grey fill, issue ring)", () => {
    const [c] = buildRoomChips([chip({ roomName: "5", occupancyStatus: "free", online: false, battery: 90 })]);
    expect(c.status).toBe("vacant");
    expect(c.fault).toBe("issue");
  });
  it("rings a vacant low-battery lock as a warning, and leaves healthy/no-lock unrung", () => {
    expect(buildRoomChips([chip({ roomName: "1", online: true, battery: 5 })])[0].fault).toBe("warning");
    expect(buildRoomChips([chip({ roomName: "2", online: true, battery: 90 })])[0].fault).toBeNull();
    expect(buildRoomChips([chip({ roomName: "3", mapped: false, online: false })])[0].fault).toBeNull();
  });
});

describe("filterRoomTiles", () => {
  const tiles = [
    toRoomTile({ ...base, roomId: "101", occupancyStatus: "occupied", online: true, battery: 90 }),
    toRoomTile({ ...base, roomId: "102", occupancyStatus: "free", online: false, battery: 50 }),
    toRoomTile({ ...base, roomId: "203", occupancyStatus: "reserved", online: true, battery: 10 }),
  ];
  it("filters by room-number search", () => {
    expect(filterRoomTiles(tiles, { search: "10" }).map((t) => t.roomId)).toEqual(["101", "102"]);
  });
  it("filters by occupancy", () => {
    expect(filterRoomTiles(tiles, { occupancy: "occupied" }).map((t) => t.roomId)).toEqual(["101"]);
  });
  it("filters by health=offline and health=low_battery", () => {
    expect(filterRoomTiles(tiles, { health: "offline" }).map((t) => t.roomId)).toEqual(["102"]);
    expect(filterRoomTiles(tiles, { health: "low_battery" }).map((t) => t.roomId)).toEqual(["203"]);
  });
  it("filters unmapped rooms, and excludes them from online/offline/low_battery", () => {
    const withUnmapped = [
      ...tiles,
      toRoomTile({ ...base, roomId: "305", mapped: false, online: false, battery: null }),
    ];
    expect(filterRoomTiles(withUnmapped, { health: "unmapped" }).map((t) => t.roomId)).toEqual(["305"]);
    expect(filterRoomTiles(withUnmapped, { health: "offline" }).map((t) => t.roomId)).toEqual(["102"]);
    expect(filterRoomTiles(withUnmapped, { health: "online" }).map((t) => t.roomId)).toEqual(["101", "203"]);
  });
  it("returns all tiles when filters are 'all' or empty", () => {
    expect(filterRoomTiles(tiles, {})).toHaveLength(3);
    expect(filterRoomTiles(tiles, { occupancy: "all", health: "all", search: "" })).toHaveLength(3);
  });
});
