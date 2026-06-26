import { describe, it, expect } from "vitest";
import { buildRoomIndex, resolveFromIndex } from "./room-resolver";

describe("buildRoomIndex / resolveFromIndex", () => {
  const rooms = [
    { roomID: "405758-102", roomName: "292" },
    { roomID: "405761-25", roomName: "239" },
    { roomID: "405763-8", roomName: "230" },
  ];

  it("resolves a room number to its Cloudbeds roomID", () => {
    const idx = buildRoomIndex(rooms);
    expect(resolveFromIndex(idx, "292")).toBe("405758-102");
    expect(resolveFromIndex(idx, "239")).toBe("405761-25");
  });

  it("trims whitespace on both the index and the lookup", () => {
    const idx = buildRoomIndex([{ roomID: "405758-102", roomName: " 292 " }]);
    expect(resolveFromIndex(idx, "  292 ")).toBe("405758-102");
  });

  it("returns null for an unknown room number", () => {
    const idx = buildRoomIndex(rooms);
    expect(resolveFromIndex(idx, "999")).toBeNull();
    expect(resolveFromIndex(idx, "")).toBeNull();
  });

  it("never resolves an ambiguous room number (same name, two roomIDs)", () => {
    const idx = buildRoomIndex([
      { roomID: "405758-1", roomName: "105" },
      { roomID: "405763-9", roomName: "105" },
    ]);
    expect(idx.ambiguous.has("105")).toBe(true);
    expect(resolveFromIndex(idx, "105")).toBeNull();
  });

  it("ignores rows with a blank name or id", () => {
    const idx = buildRoomIndex([
      { roomID: "405758-1", roomName: "" },
      { roomID: "", roomName: "200" },
      { roomID: "405758-2", roomName: "201" },
    ]);
    expect(resolveFromIndex(idx, "201")).toBe("405758-2");
    expect(resolveFromIndex(idx, "200")).toBeNull();
  });
});
