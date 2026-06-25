import { describe, it, expect } from "vitest";
import { extractRoomIds, roomNameFor } from "./cloudbeds";

describe("extractRoomIds", () => {
  it("reads roomIDs from assigned[] (the real Cloudbeds getReservation shape)", () => {
    const detail = { assigned: [{ roomID: "405761-25", roomName: "239" }] };
    expect(extractRoomIds(detail as any)).toEqual(["405761-25"]);
  });

  it("reads from guestList[].rooms[] and dedupes across sources", () => {
    const detail = {
      assigned: [{ roomID: "405761-25" }],
      guestList: { "179835296": { roomID: "405761-25", rooms: [{ roomID: "405761-25" }] } },
    };
    expect(extractRoomIds(detail as any)).toEqual(["405761-25"]);
  });

  it("still reads a top-level rooms[] if present", () => {
    expect(extractRoomIds({ rooms: [{ roomID: "X-1" }] } as any)).toEqual(["X-1"]);
  });

  it("returns [] when there are no rooms anywhere", () => {
    expect(extractRoomIds({} as any)).toEqual([]);
  });
});

describe("roomNameFor", () => {
  it("finds the room name from assigned[]", () => {
    expect(roomNameFor({ assigned: [{ roomID: "405761-25", roomName: "239" }] } as any, "405761-25")).toBe("239");
  });
});
