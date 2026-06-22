/**
 * Pure view-model for the per-property Dashboard: KPI counts + a "My Actions" feed.
 * No zones / no room grid (by design). The page does the Prisma reads (locks,
 * room states, active guest passcodes, recent door-left-open events) and feeds
 * plain arrays in here. Alert *records* arrive with the Alerts engine; until then
 * these are derived at request time.
 */
export type Occupancy = "free" | "reserved" | "occupied";
export type ActionKind = "offline" | "low_battery" | "no_guest_code" | "door_left_open";

const LOW_BATTERY_PCT = 20;

export interface LockRow { roomId: string; online: boolean; battery: number | null; }
export interface StateRow { roomId: string; occupancyStatus: Occupancy; }

export interface DashKpis {
  totalLocks: number; online: number; offline: number; lowBattery: number;
  occupied: number; vacant: number;
}
export interface DashAction {
  kind: ActionKind; roomId: string; label: string; severity: "warning" | "critical";
}
export interface DashboardInput {
  locks: LockRow[]; states: StateRow[];
  activeGuestRoomIds: string[]; doorOpenRoomIds: string[];
}
export interface Dashboard { kpis: DashKpis; actions: DashAction[]; }

export function buildDashboard(input: DashboardInput): Dashboard {
  const { locks, states, activeGuestRoomIds, doorOpenRoomIds } = input;
  const hasGuestCode = new Set(activeGuestRoomIds);
  const occByRoom = new Map(states.map((s) => [s.roomId, s.occupancyStatus]));

  let online = 0, offline = 0, lowBattery = 0;
  const actions: DashAction[] = [];
  for (const l of locks) {
    const low = l.battery != null && l.battery < LOW_BATTERY_PCT;
    if (l.online) online++; else { offline++; actions.push({ kind: "offline", roomId: l.roomId, label: `Lock offline in room ${l.roomId}`, severity: "critical" }); }
    if (low) { lowBattery++; actions.push({ kind: "low_battery", roomId: l.roomId, label: `Low battery (${l.battery}%) in room ${l.roomId}`, severity: "warning" }); }
  }

  let occupied = 0;
  for (const s of states) if (s.occupancyStatus === "occupied") occupied++;

  for (const [roomId, occ] of occByRoom) {
    if ((occ === "occupied" || occ === "reserved") && !hasGuestCode.has(roomId)) {
      actions.push({ kind: "no_guest_code", roomId, label: `No active guest code in room ${roomId}`, severity: "warning" });
    }
  }
  for (const roomId of doorOpenRoomIds) {
    actions.push({ kind: "door_left_open", roomId, label: `Door left open in room ${roomId}`, severity: "critical" });
  }

  return {
    kpis: { totalLocks: locks.length, online, offline, lowBattery, occupied, vacant: states.length - occupied },
    actions,
  };
}
