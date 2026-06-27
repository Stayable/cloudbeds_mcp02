/**
 * Server-side loader for the room detail Guest card. Orchestrates the live
 * Cloudbeds reads and is wrapped in try/catch so a missing key, missing
 * reservation, or API hiccup NEVER breaks the room page — it just returns null
 * and the page falls back to the cached RoomState summary.
 */
import { CloudbedsRegistry, getReservation, getGuest } from "./cloudbeds";
import { toGuestDetails, type GuestDetails } from "./guest-details";

export async function loadGuestDetails(
  propertyId: string,
  reservationId: string,
  roomNumber: string,
): Promise<GuestDetails | null> {
  try {
    const registry = CloudbedsRegistry.fromEnv();
    const reservation = await getReservation(registry, propertyId, reservationId);
    if (!reservation) return null; // no key for this property

    // Only call getGuest if the reservation didn't already carry contact info.
    let guest = null;
    const hasContact = Boolean(reservation.email || reservation.phone);
    if (!hasContact && reservation.guestID != null) {
      guest = await getGuest(registry, propertyId, String(reservation.guestID));
    }
    return toGuestDetails({ reservation, guest, roomNumber });
  } catch {
    return null; // never break the page on a Cloudbeds failure
  }
}
