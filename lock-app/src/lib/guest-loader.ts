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

    const resEmail = reservation.guestEmail ?? reservation.email;
    const resPhone = reservation.guestPhone ?? reservation.phone;

    // Only call getGuest if the reservation didn't already carry contact info.
    let guest = null;
    const hasContact = Boolean(resEmail || resPhone);
    if (!hasContact && reservation.guestID != null) {
      guest = await getGuest(registry, propertyId, String(reservation.guestID));
    }

    return toGuestDetails({
      reservation: {
        guestName: reservation.guestName,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        email: resEmail,
        phone: resPhone,
      },
      guest: guest
        ? {
            email: guest.guestEmail ?? guest.email,
            phone: guest.guestPhone ?? guest.phone,
            cellPhone: guest.guestCellPhone ?? guest.cellPhone,
          }
        : null,
      roomNumber,
    });
  } catch {
    return null; // never break the page on a Cloudbeds failure
  }
}
