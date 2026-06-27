import { describe, it, expect } from "vitest";
import { buildOccupiedRooms } from "./occupancy";
import { extractRoomIds, roomNameFor, type ReservationDetail } from "./cloudbeds";

describe("extractRoomIds", () => {
  it("reads roomIDs from assigned[] (the real getReservation shape)", () => {
    expect(extractRoomIds({ assigned: [{ roomID: "405761-25", roomName: "239" }] })).toEqual(["405761-25"]);
  });
  it("reads from guestList[].rooms[] and dedupes across sources", () => {
    const d: ReservationDetail = {
      assigned: [{ roomID: "405761-25" }],
      guestList: { "1": { roomID: "405761-25", rooms: [{ roomID: "405761-25" }] } },
    };
    expect(extractRoomIds(d)).toEqual(["405761-25"]);
  });
  it("returns [] when no rooms are present", () => {
    expect(extractRoomIds({})).toEqual([]);
  });
});

describe("roomNameFor", () => {
  it("finds the human room number for a roomID", () => {
    expect(roomNameFor({ assigned: [{ roomID: "405761-25", roomName: "239" }] }, "405761-25")).toBe("239");
    expect(roomNameFor({ assigned: [{ roomID: "405761-25" }] }, "405761-25")).toBeNull();
  });
});

describe("buildOccupiedRooms", () => {
  it("makes one occupied row per assigned room with guest + checkout", () => {
    const rows: ReservationDetail[] = [
      { reservationID: "r1", guestName: "Victor Nwachukwu", endDate: "2026-06-29", assigned: [{ roomID: "p-292", roomName: "292" }] },
    ];
    expect(buildOccupiedRooms(rows)).toEqual([
      { roomId: "p-292", reservationId: "r1", guestName: "Victor Nwachukwu", checkoutDate: "2026-06-29" },
    ]);
  });
  it("expands a multi-room reservation into a row per room", () => {
    const rows: ReservationDetail[] = [
      { reservationID: "r1", assigned: [{ roomID: "a" }, { roomID: "b" }] },
    ];
    expect(buildOccupiedRooms(rows).map((o) => o.roomId)).toEqual(["a", "b"]);
  });
  it("skips reservations with no id or no room, and nulls blank guest/date", () => {
    const rows: ReservationDetail[] = [
      { guestName: "No id", assigned: [{ roomID: "x" }] },        // dropped: no reservationID
      { reservationID: "r2", assigned: [] },                       // dropped: no room
      { reservationID: "r3", guestName: "  ", assigned: [{ roomID: "y" }] },
    ];
    const out = buildOccupiedRooms(rows);
    expect(out).toEqual([{ roomId: "y", reservationId: "r3", guestName: null, checkoutDate: null }]);
  });
  it("last reservation wins if two map to the same room", () => {
    const rows: ReservationDetail[] = [
      { reservationID: "r1", guestName: "First", assigned: [{ roomID: "dup" }] },
      { reservationID: "r2", guestName: "Second", assigned: [{ roomID: "dup" }] },
    ];
    expect(buildOccupiedRooms(rows)).toEqual([{ roomId: "dup", reservationId: "r2", guestName: "Second", checkoutDate: null }]);
  });
});
