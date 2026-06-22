import { describe, it, expect } from "vitest";
import { buildDashboard } from "./dashboard";

const locks = [
  { roomId: "101", online: true, battery: 92 },
  { roomId: "102", online: true, battery: 14 }, // low
  { roomId: "103", online: false, battery: 60 }, // offline
];
const states = [
  { roomId: "101", occupancyStatus: "occupied" as const },
  { roomId: "102", occupancyStatus: "reserved" as const },
  { roomId: "103", occupancyStatus: "free" as const },
];

describe("buildDashboard", () => {
  it("computes KPI counts", () => {
    const { kpis } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: [] });
    expect(kpis).toMatchObject({ totalLocks: 3, online: 2, offline: 1, lowBattery: 1, occupied: 1, vacant: 2 });
  });

  it("raises actions for offline, low battery, and occupied/reserved rooms without a guest code", () => {
    const { actions } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: [] });
    const kinds = actions.map((a) => `${a.kind}:${a.roomId}`);
    expect(kinds).toContain("offline:103");
    expect(kinds).toContain("low_battery:102");
    expect(kinds).toContain("no_guest_code:102"); // reserved, no active guest pin
    expect(kinds).not.toContain("no_guest_code:101"); // occupied but has a pin
    expect(kinds).not.toContain("no_guest_code:103"); // free -> no code expected
  });

  it("raises a critical door-left-open action", () => {
    const { actions } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: ["101"] });
    const door = actions.find((a) => a.kind === "door_left_open");
    expect(door).toMatchObject({ roomId: "101", severity: "critical" });
  });

  it("is all-clear with healthy, coded, occupied rooms", () => {
    const { actions } = buildDashboard({
      locks: [{ roomId: "101", online: true, battery: 90 }],
      states: [{ roomId: "101", occupancyStatus: "occupied" }],
      activeGuestRoomIds: ["101"], doorOpenRoomIds: [],
    });
    expect(actions).toHaveLength(0);
  });
});
