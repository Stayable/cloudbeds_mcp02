/**
 * Best-effort guest-email orchestration for the middleware's door-code lifecycle
 * (check-in, room-change, checkout). Resolves the guest's contact from the
 * reservation detail (falling back to getGuest), maps it to the email template,
 * and sends. NEVER throws — a notification failure must not affect the PIN
 * operation that triggered it; callers log the returned reason.
 *
 * If RESEND_API_KEY is unset (or the key can't read the guest's email), this
 * simply returns { sent:false } — safe to deploy before those are configured.
 */
import {
  CloudbedsRegistry,
  getReservation,
  getGuest,
  type ReservationDetail,
} from "./cloudbeds";
import { sendGuestEmail, type GuestEmailKind } from "./guest-email";

// propertyId → display name. Mirror of lock-app's PROPERTIES (id + name only).
const PROPERTY_NAMES: Record<string, string> = {
  "206628": "Jacksonville North",
  "210987": "Jacksonville West",
  "210986": "Kissimmee East",
  "210969": "Kissimmee West",
  "210972": "Lakeland",
  "210971": "Orlando OBT",
  "208155": "St. Augustine",
  "318197": "Davenport",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a Cloudbeds "YYYY-MM-DD" as "Mon D, YYYY"; pass through non-ISO; null if empty. Pure. */
export function formatStayDate(iso?: string | null): string | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${MONTHS[mi]} ${Number(m[3])}, ${m[1]}`;
}

/** First token of a full name, or null. Pure. */
export function firstNameOf(fullName?: string | null): string | null {
  const n = (fullName ?? "").trim();
  return n ? n.split(/\s+/)[0] || null : null;
}

/** Guest-facing property label, e.g. "Stayable Lakeland". Pure. */
export function propertyDisplayName(propertyId: string): string {
  const name = PROPERTY_NAMES[propertyId];
  return name ? `Stayable ${name}` : "Stayable";
}

/** Resolve the guest's email + name from the reservation, falling back to getGuest. */
async function resolveGuestContact(
  registry: CloudbedsRegistry,
  propertyId: string,
  detail: ReservationDetail,
): Promise<{ email: string | null; name: string | null }> {
  let email = (detail.guestEmail ?? detail.email ?? "").trim() || null;
  const name = (detail.guestName ?? "").trim() || null;
  if (!email && detail.guestID != null) {
    const guest = await getGuest(registry, propertyId, String(detail.guestID));
    email = ((guest?.guestEmail ?? guest?.email) ?? "").trim() || null;
  }
  return { email, name };
}

export async function notifyGuestCode(args: {
  registry: CloudbedsRegistry;
  propertyId: string;
  reservationId: string;
  roomNumber: string;
  kind: GuestEmailKind;
  doorCode?: string | null;
  /** Pass the already-fetched reservation to avoid a second getReservation. */
  detail?: ReservationDetail;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const detail = args.detail ?? (await getReservation(args.registry, args.propertyId, args.reservationId));
    const { email, name } = await resolveGuestContact(args.registry, args.propertyId, detail);
    if (!email) return { sent: false, reason: "no guest email on file" };
    await sendGuestEmail(email, args.kind, {
      guestFirstName: firstNameOf(name),
      propertyName: propertyDisplayName(args.propertyId),
      roomNumber: args.roomNumber,
      doorCode: args.doorCode ?? null,
      checkInDate: formatStayDate(detail.startDate),
      checkOutDate: formatStayDate(detail.endDate),
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: e?.message ?? String(e) };
  }
}
