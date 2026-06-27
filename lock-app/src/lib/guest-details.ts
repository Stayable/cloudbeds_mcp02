/**
 * Pure view-model mapper for the room detail page's Guest card. Takes a
 * Cloudbeds reservation (name + lease dates, sometimes contact) and an optional
 * guest record (email/phone) and normalizes them for display. No I/O — the
 * Cloudbeds fetching + try/catch live in guest-loader.ts.
 */
export interface GuestDetails {
  name: string;
  email: string | null;
  phone: string | null;
  roomNumber: string;
  leaseStart: string | null; // formatted, e.g. "Jun 25, 2026"
  leaseEnd: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a Cloudbeds "YYYY-MM-DD" date as "Mon D, YYYY". Non-ISO input passes
 *  through unchanged; empty input → null. Avoids Date parsing (no TZ surprises). */
function formatDate(iso?: string): string | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${MONTHS[mi]} ${Number(m[3])}, ${m[1]}`;
}

export function toGuestDetails(input: {
  reservation: { guestName?: string; startDate?: string; endDate?: string; email?: string; phone?: string };
  guest: { email?: string; phone?: string; cellPhone?: string } | null;
  roomNumber: string;
}): GuestDetails {
  const r = input.reservation;
  const g = input.guest;
  const name = (r.guestName ?? "").trim() || "Guest";
  const email = (r.email ?? g?.email ?? "").trim() || null;
  const phone = (r.phone ?? g?.phone ?? g?.cellPhone ?? "").trim() || null;
  return {
    name,
    email,
    phone,
    roomNumber: input.roomNumber,
    leaseStart: formatDate(r.startDate),
    leaseEnd: formatDate(r.endDate),
  };
}
