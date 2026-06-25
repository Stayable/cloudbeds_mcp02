import { describe, it, expect } from "vitest";
import { classifyIntent, reservationNoteBody } from "./reservation-intent";

describe("classifyIntent (check-in only)", () => {
  it("creates a code when the guest checks in", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "checked_in" })).toBe("ensure");
  });

  it("does NOT create a code at booking/confirmation", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "confirmed" })).toBe("ignore");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "not_confirmed" })).toBe("ignore");
  });

  it("does NOT create a code on reservation creation", () => {
    expect(classifyIntent({ event: "reservation/created", propertyID: 1, reservationID: "r" })).toBe("ignore");
  });

  it("revokes on checkout, cancel, no-show", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "checked_out" })).toBe("revoke");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "canceled" })).toBe("revoke");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "no_show" })).toBe("revoke");
  });

  it("revokes on reservation deletion", () => {
    expect(classifyIntent({ event: "reservation/deleted", propertyID: 1, reservationID: "r" })).toBe("revoke");
  });

  it("ignores anything else", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "whatever" })).toBe("ignore");
  });
});

describe("reservationNoteBody", () => {
  it("includes the PIN, room, and validity dates", () => {
    const body = reservationNoteBody({ pin: "445572", roomName: "239", startDate: "2026-06-25", endDate: "2026-06-26" });
    expect(body).toContain("445572");
    expect(body).toContain("239");
    expect(body).toContain("2026-06-25");
    expect(body).toContain("2026-06-26");
  });

  it("works with just the PIN", () => {
    const body = reservationNoteBody({ pin: "445572" });
    expect(body).toContain("445572");
    expect(body.length).toBeGreaterThan(0);
  });
});
