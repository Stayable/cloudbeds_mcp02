import { describe, it, expect } from "vitest";
import { toGuestDetails } from "./guest-details";

describe("toGuestDetails", () => {
  const base = {
    reservation: { guestName: "Alexander Reyes", startDate: "2026-06-25", endDate: "2026-06-28" },
    guest: { email: "alex@example.com", phone: "+1 863-555-0100" },
    roomNumber: "239",
  };

  it("maps a full reservation + guest into the view model with formatted dates", () => {
    const d = toGuestDetails(base);
    expect(d.name).toBe("Alexander Reyes");
    expect(d.roomNumber).toBe("239");
    expect(d.email).toBe("alex@example.com");
    expect(d.phone).toBe("+1 863-555-0100");
    expect(d.leaseStart).toBe("Jun 25, 2026");
    expect(d.leaseEnd).toBe("Jun 28, 2026");
  });

  it("falls back to 'Guest' when the name is missing", () => {
    const d = toGuestDetails({ ...base, reservation: { startDate: "2026-06-25", endDate: "2026-06-28" } });
    expect(d.name).toBe("Guest");
  });

  it("returns null for missing email/phone (renders as a dash in the UI)", () => {
    const d = toGuestDetails({ reservation: { guestName: "Sam" }, guest: null, roomNumber: "101" });
    expect(d.email).toBeNull();
    expect(d.phone).toBeNull();
    expect(d.leaseStart).toBeNull();
    expect(d.leaseEnd).toBeNull();
  });

  it("prefers reservation contact, then guest email, then guest cellPhone", () => {
    const d = toGuestDetails({
      reservation: { guestName: "Sam", email: "res@example.com" },
      guest: { email: "guest@example.com", cellPhone: "863-555-0199" },
      roomNumber: "101",
    });
    expect(d.email).toBe("res@example.com");
    expect(d.phone).toBe("863-555-0199");
  });

  it("passes a non-ISO date through unchanged rather than mangling it", () => {
    const d = toGuestDetails({ reservation: { guestName: "Sam", startDate: "25 Jun" }, guest: null, roomNumber: "101" });
    expect(d.leaseStart).toBe("25 Jun");
  });
});
