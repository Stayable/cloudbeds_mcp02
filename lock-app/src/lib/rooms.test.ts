import { describe, it, expect } from "vitest";
import { maskPin, occupancyColor, toRoomTile, filterRoomTiles, type RoomTileInput } from "./rooms";

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
  it("uses the alias as label when present, else the room id", () => {
    expect(toRoomTile({ ...base, alias: "Suite A" }).label).toBe("Suite A");
    expect(toRoomTile(base).label).toBe("101");
  });
  it("has no masked code when there is no active pin", () => {
    expect(toRoomTile(base).maskedCode).toBeNull();
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
  it("returns all tiles when filters are 'all' or empty", () => {
    expect(filterRoomTiles(tiles, {})).toHaveLength(3);
    expect(filterRoomTiles(tiles, { occupancy: "all", health: "all", search: "" })).toHaveLength(3);
  });
});
