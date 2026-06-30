import { describe, it, expect } from "vitest";
import { buildGuestEmail, type GuestEmailData } from "./guest-email";

const base: GuestEmailData = {
  guestFirstName: "Alexander",
  propertyName: "Stayable Lakeland",
  roomNumber: "239",
  doorCode: "794490",
  checkInDate: "Jun 25, 2026",
  checkOutDate: "Jun 28, 2026",
};

describe("buildGuestEmail", () => {
  it("generated: shows the code, room, property, and welcomes the guest", () => {
    const { subject, html, text } = buildGuestEmail("generated", base);
    expect(subject).toContain("239");
    expect(html).toContain("794490");
    expect(html).toContain("Stayable Lakeland");
    expect(html).toContain("Welcome, Alexander");
    expect(text).toContain("794490");
  });

  it("room_changed: new code + 'patience' message + indicates the move", () => {
    const { subject, html } = buildGuestEmail("room_changed", base);
    expect(subject).toContain("new door code");
    expect(html).toContain("794490");
    expect(html.toLowerCase()).toContain("patience");
    expect(html).toContain("239");
  });

  it("updated: shows the refreshed code", () => {
    const { subject, html } = buildGuestEmail("updated", base);
    expect(subject.toLowerCase()).toContain("updated");
    expect(html).toContain("794490");
  });

  it("revoked: warm thank-you with NO door code shown", () => {
    const { subject, html, text } = buildGuestEmail("revoked", { ...base, doorCode: null });
    expect(subject.toLowerCase()).toContain("thank you");
    expect(html).not.toContain("794490");
    expect(html).toContain("239");
    expect(text.toLowerCase()).toContain("deactivated");
  });

  it("code_revoked: deactivation notice, no code, points to a follow-up", () => {
    const { subject, html, text } = buildGuestEmail("code_revoked", { ...base, doorCode: null });
    expect(subject.toLowerCase()).toContain("deactivated");
    expect(html).not.toContain("794490");
    expect(html).toContain("239");
    expect(text.toLowerCase()).toContain("new door code is on its way");
  });

  it("falls back to 'Guest' when no first name", () => {
    const { html } = buildGuestEmail("generated", { ...base, guestFirstName: null });
    expect(html).toContain("Welcome, Guest");
  });

  it("escapes HTML in guest-supplied values", () => {
    const { html } = buildGuestEmail("generated", { ...base, guestFirstName: "<script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
