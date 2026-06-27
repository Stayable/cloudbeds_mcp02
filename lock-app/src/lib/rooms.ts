/**
 * Pure view-model for the Rooms grid. Joins a room's mapping (LockMap, incl.
 * health columns), occupancy (RoomState), and its active guest code (Passcode)
 * into one tile, and provides search/filter over the resulting tiles. The page
 * does the Prisma reads and feeds plain objects in here.
 */
export type Occupancy = "free" | "reserved" | "occupied";
export type StatusColor = "red" | "amber" | "green";
export type HealthFilter = "all" | "online" | "offline" | "low_battery" | "unmapped";

const LOW_BATTERY_PCT = 20; // spec §9 threshold

export interface RoomTileInput {
  roomId: string;
  /** Human room number (e.g. "292"), preferred for the label. */
  roomName?: string | null;
  alias?: string | null;
  /** False when the room has no lock mapped — health fields are then meaningless. Default true. */
  mapped?: boolean;
  online: boolean;
  battery: number | null;
  occupancyStatus: Occupancy;
  guestName?: string | null;
  checkoutDate?: string | null;
  /** Raw pin of the active guest code, if any. Masked before display. */
  activePin?: string | null;
}

export interface RoomTile {
  roomId: string;
  label: string;
  mapped: boolean;
  occupancy: Occupancy;
  occupancyColor: StatusColor;
  online: boolean;
  battery: number | null;
  batteryLow: boolean;
  maskedCode: string | null;
  guestName: string | null;
  checkoutDate: string | null;
}

/** Mask all but the last two characters: "123472" -> "••••72". */
export function maskPin(pin: string): string {
  return "•".repeat(Math.max(0, pin.length - 2)) + pin.slice(-2);
}

export function occupancyColor(o: Occupancy): StatusColor {
  if (o === "occupied") return "red";
  if (o === "reserved") return "amber";
  return "green";
}

export function toRoomTile(input: RoomTileInput): RoomTile {
  const mapped = input.mapped ?? true;
  return {
    roomId: input.roomId,
    label: input.alias?.trim()
      ? input.alias
      : input.roomName?.trim()
        ? input.roomName
        : input.roomId,
    mapped,
    occupancy: input.occupancyStatus,
    occupancyColor: occupancyColor(input.occupancyStatus),
    online: input.online,
    battery: input.battery,
    batteryLow: input.battery != null && input.battery < LOW_BATTERY_PCT,
    maskedCode: input.activePin ? maskPin(input.activePin) : null,
    guestName: input.guestName ?? null,
    checkoutDate: input.checkoutDate ?? null,
  };
}

/**
 * A Portfolio room chip carries two independent signals:
 *  - `status` (the FILL) is occupancy-first: no-lock → black, vacant → grey
 *    (always), and only OCCUPIED rooms color by lock health — ok (green) /
 *    warning=low battery (orange) / issue=offline (red). Answers "which GUESTS
 *    are affected right now?".
 *  - `fault` (the RING) is pure lock health on any MAPPED room, regardless of
 *    occupancy: issue=offline / warning=low / null=healthy. This is what makes a
 *    broken lock in a VACANT room visible (grey fill + colored ring) without
 *    diluting the occupied-room red.
 */
export type ChipStatus = "no-lock" | "vacant" | "ok" | "warning" | "issue";
export type ChipFault = "issue" | "warning" | null;

export interface RoomChipInput {
  roomId: string;
  roomName?: string | null;
  mapped: boolean;
  online: boolean;
  battery: number | null;
  occupancyStatus?: Occupancy;
}

export interface RoomChip {
  roomId: string;
  label: string;
  status: ChipStatus;
  fault: ChipFault;
}

export function roomChipStatus(r: {
  mapped: boolean; occupied: boolean; online: boolean; batteryLow: boolean;
}): ChipStatus {
  if (!r.mapped) return "no-lock"; // black — no lock assigned
  if (!r.occupied) return "vacant"; // grey — nothing to manage
  if (!r.online) return "issue"; // red — guest's lock is offline
  if (r.batteryLow) return "warning"; // orange — guest's lock low battery
  return "ok"; // green — occupied, lock healthy
}

/** Lock-health ring for a mapped lock (independent of occupancy). Null = healthy or no lock. */
export function roomChipFault(r: { mapped: boolean; online: boolean; batteryLow: boolean }): ChipFault {
  if (!r.mapped) return null;
  if (!r.online) return "issue"; // red ring — offline
  if (r.batteryLow) return "warning"; // orange ring — low battery
  return null;
}

export function buildRoomChips(rooms: RoomChipInput[]): RoomChip[] {
  return rooms
    .map((r) => {
      const batteryLow = r.battery != null && r.battery < LOW_BATTERY_PCT;
      return {
        roomId: r.roomId,
        label: r.roomName?.trim() ? r.roomName : r.roomId,
        status: roomChipStatus({ mapped: r.mapped, occupied: r.occupancyStatus === "occupied", online: r.online, batteryLow }),
        fault: roomChipFault({ mapped: r.mapped, online: r.online, batteryLow }),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

export interface RoomFilter {
  search?: string;
  occupancy?: Occupancy | "all";
  health?: HealthFilter;
}

export function filterRoomTiles(tiles: RoomTile[], opts: RoomFilter): RoomTile[] {
  const search = (opts.search ?? "").trim().toLowerCase();
  return tiles.filter((t) => {
    if (search && !t.roomId.toLowerCase().includes(search) && !t.label.toLowerCase().includes(search)) {
      return false;
    }
    if (opts.occupancy && opts.occupancy !== "all" && t.occupancy !== opts.occupancy) return false;
    switch (opts.health) {
      case "online":
        return t.mapped && t.online;
      case "offline":
        return t.mapped && !t.online;
      case "low_battery":
        return t.mapped && t.batteryLow;
      case "unmapped":
        return !t.mapped;
      default:
        return true;
    }
  });
}
