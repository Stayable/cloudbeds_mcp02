/**
 * Pure view-model for the Rooms grid. Joins a room's mapping (LockMap, incl.
 * health columns), occupancy (RoomState), and its active guest code (Passcode)
 * into one tile, and provides search/filter over the resulting tiles. The page
 * does the Prisma reads and feeds plain objects in here.
 */
export type Occupancy = "free" | "reserved" | "occupied";
export type StatusColor = "red" | "amber" | "green";
export type HealthFilter = "all" | "online" | "offline" | "low_battery";

const LOW_BATTERY_PCT = 20; // spec §9 threshold

export interface RoomTileInput {
  roomId: string;
  alias?: string | null;
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
  return {
    roomId: input.roomId,
    label: input.alias?.trim() ? input.alias : input.roomId,
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
        return t.online;
      case "offline":
        return !t.online;
      case "low_battery":
        return t.batteryLow;
      default:
        return true;
    }
  });
}
