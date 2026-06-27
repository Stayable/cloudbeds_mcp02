/**
 * Rehydrate RoomState occupancy from Cloudbeds. The webhook keeps occupancy live
 * going forward, but rooms occupied before the webhook was wired (or that never
 * fired an event) sit stale as "free". This pulls the property's currently
 * checked-in reservations, maps them to their assigned room(s), and:
 *   - upserts those rooms to "occupied" (with guest name + checkout date), and
 *   - resets any room currently marked "occupied" that is no longer checked in.
 *
 * A room is "occupied" iff it has an in-house (checked_in) reservation — the same
 * signal the middleware webhook uses (see middleware/lib/reservation-intent.ts).
 */
import { prisma } from "@/lib/db";
import {
  CloudbedsRegistry, listCheckedInReservations, extractRoomIds, getReservation,
} from "@/lib/cloudbeds";
import { buildOccupiedRooms } from "@/lib/occupancy";

export interface OccupancySyncResult {
  propertyId: string;
  reservations: number; // checked-in reservations seen
  occupied: number;     // rooms set occupied
  freed: number;        // stale "occupied" rooms reset to free
  error?: string;
}

/** Run a small async mapper with bounded concurrency (keeps Cloudbeds calls civil). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Rehydrate occupancy for one property. Returns counts; throws only on a hard
 * failure (no key / Cloudbeds unreachable) so callers can report per-property.
 */
export async function syncPropertyOccupancy(propertyId: string): Promise<OccupancySyncResult> {
  const registry = CloudbedsRegistry.fromEnv();
  if (!registry.has(propertyId)) {
    return { propertyId, reservations: 0, occupied: 0, freed: 0, error: `No Cloudbeds key for property ${propertyId}` };
  }

  const rows = await listCheckedInReservations(registry, propertyId);
  if (rows == null) {
    return { propertyId, reservations: 0, occupied: 0, freed: 0, error: `No Cloudbeds key for property ${propertyId}` };
  }

  // The list rows may omit room assignments; fetch the detail for any row that
  // doesn't already carry a room so the mapping is always exact.
  const detailed = await mapLimit(rows, 6, async (row) => {
    if (extractRoomIds(row).length > 0) return row;
    const id = row.reservationID != null ? String(row.reservationID) : "";
    if (!id) return row;
    const detail = await getReservation(registry, propertyId, id);
    return detail ? { ...row, ...detail } : row;
  });

  const occupied = buildOccupiedRooms(detailed);
  const occupiedIds = new Set(occupied.map((o) => o.roomId));

  for (const o of occupied) {
    await prisma.roomState.upsert({
      where: { propertyId_roomId: { propertyId, roomId: o.roomId } },
      create: {
        propertyId, roomId: o.roomId, occupancyStatus: "occupied",
        guestName: o.guestName, checkoutDate: o.checkoutDate, currentReservationId: o.reservationId,
      },
      update: {
        occupancyStatus: "occupied",
        guestName: o.guestName, checkoutDate: o.checkoutDate, currentReservationId: o.reservationId,
      },
    });
  }

  // Reset rooms we still have marked occupied that are no longer checked in.
  const stale = await prisma.roomState.findMany({
    where: { propertyId, occupancyStatus: "occupied" },
    select: { roomId: true },
  });
  const toFree = stale.map((s) => s.roomId).filter((id) => !occupiedIds.has(id));
  if (toFree.length > 0) {
    await prisma.roomState.updateMany({
      where: { propertyId, roomId: { in: toFree } },
      data: { occupancyStatus: "free", guestName: null, checkoutDate: null, currentReservationId: null },
    });
  }

  return { propertyId, reservations: rows.length, occupied: occupied.length, freed: toFree.length };
}

/** Rehydrate occupancy across several properties in parallel (per-property errors captured). */
export async function syncOccupancy(propertyIds: string[]): Promise<OccupancySyncResult[]> {
  return Promise.all(
    propertyIds.map((id) =>
      syncPropertyOccupancy(id).catch((e: unknown) => ({
        propertyId: id, reservations: 0, occupied: 0, freed: 0,
        error: e instanceof Error ? e.message : String(e),
      })),
    ),
  );
}
