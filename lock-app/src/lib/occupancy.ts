/**
 * Pure occupancy helpers (no DB / no Cloudbeds I/O) so they can be unit-tested.
 * The DB orchestration that calls these lives in occupancy-sync.ts.
 */
import { extractRoomIds, type ReservationDetail } from "./cloudbeds";

export interface OccupiedRoom {
  roomId: string;
  reservationId: string;
  guestName: string | null;
  checkoutDate: string | null;
}

/**
 * Collapse checked-in reservation details into one occupied row per room. If two
 * reservations map to the same room the last one wins (rare; Cloudbeds shouldn't
 * double-assign an occupied room). Reservations with no id or no resolvable room
 * are skipped; `endDate` is the checkout date.
 */
export function buildOccupiedRooms(reservations: ReservationDetail[]): OccupiedRoom[] {
  const byRoom = new Map<string, OccupiedRoom>();
  for (const r of reservations) {
    const reservationId = r.reservationID != null ? String(r.reservationID) : "";
    if (!reservationId) continue;
    for (const roomId of extractRoomIds(r)) {
      byRoom.set(roomId, {
        roomId,
        reservationId,
        guestName: r.guestName?.trim() ? r.guestName.trim() : null,
        checkoutDate: r.endDate?.trim() ? r.endDate.trim() : null,
      });
    }
  }
  return [...byRoom.values()];
}
