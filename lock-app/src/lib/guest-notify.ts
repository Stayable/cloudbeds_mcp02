/**
 * Best-effort guest-email orchestration for door-code lifecycle events. Loads the
 * guest's contact from Cloudbeds (via loadGuestDetails, which never throws), maps
 * it to the email template fields, and sends. NEVER throws — a notification
 * failure must not affect the code operation that triggered it; the caller logs
 * the returned reason if it wants to.
 */
import { loadGuestDetails } from "./guest-loader";
import { getProperty } from "./properties";
import { sendGuestEmail, type GuestEmailKind } from "./guest-email";

/** First token of a full name, or null. Pure. */
export function firstNameOf(fullName?: string | null): string | null {
  const n = (fullName ?? "").trim();
  return n ? n.split(/\s+/)[0] || null : null;
}

/** Guest-facing property label, e.g. "Stayable Lakeland". Pure. */
export function propertyDisplayName(propertyId: string): string {
  const p = getProperty(propertyId);
  return p ? `Stayable ${p.name}` : "Stayable";
}

export async function notifyGuestCode(args: {
  propertyId: string;
  reservationId: string;
  roomNumber: string;
  kind: GuestEmailKind;
  doorCode?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const details = await loadGuestDetails(args.propertyId, args.reservationId, args.roomNumber);
    if (!details?.email) return { sent: false, reason: "no guest email on file" };
    await sendGuestEmail(details.email, args.kind, {
      guestFirstName: firstNameOf(details.name),
      propertyName: propertyDisplayName(args.propertyId),
      roomNumber: args.roomNumber,
      doorCode: args.doorCode ?? null,
      checkInDate: details.leaseStart,
      checkOutDate: details.leaseEnd,
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: e?.message ?? String(e) };
  }
}
