import { describe, it, expect } from "vitest";
import { classifyIntent, reservationNoteBody, isPaidInFull, isCheckedIn } from "./reservation-intent";

describe("classifyIntent", () => {
  // Cloudbeds check-in lives in guestStatus, and the status_changed payload's
  // top-level status stays "confirmed" — so ANY status_changed routes to the
  // ensure flow, which fetches the reservation and gates on checked-in + paid.
  it("routes status_changed to ensure regardless of thin status (incl. confirmed)", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "confirmed" })).toBe("ensure");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r" })).toBe("ensure");
  });

  it("does NOT act on a booking (created)", () => {
    expect(classifyIntent({ event: "reservation/created", propertyID: 1, reservationID: "r" })).toBe("ignore");
  });

  it("revokes on checkout, cancel, no-show (status carries through)", () => {
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "checked_out" })).toBe("revoke");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "canceled" })).toBe("revoke");
    expect(classifyIntent({ event: "reservation/status_changed", propertyID: 1, reservationID: "r", status: "no_show" })).toBe("revoke");
  });

  it("revokes on reservation deletion", () => {
    expect(classifyIntent({ event: "reservation/deleted", propertyID: 1, reservationID: "r" })).toBe("revoke");
  });
});

describe("isCheckedIn", () => {
  it("is true when the reservation top-level status is checked_in", () => {
    expect(isCheckedIn({ status: "checked_in" })).toBe(true);
    expect(isCheckedIn({ status: "checked_in", guestList: { "1": { guestStatus: "not_checked_in" } } })).toBe(true);
  });
  it("is true when any guest is checked in (fallback)", () => {
    expect(isCheckedIn({ status: "confirmed", guestList: { "1": { guestStatus: "checked_in" } } })).toBe(true);
  });
  it("is false when not checked in", () => {
    expect(isCheckedIn({ status: "confirmed", guestList: { "1": { guestStatus: "not_checked_in" } } })).toBe(false);
    expect(isCheckedIn({ status: "checked_out" })).toBe(false);
  });
  it("is false for missing/empty data", () => {
    expect(isCheckedIn({})).toBe(false);
    expect(isCheckedIn({ guestList: null })).toBe(false);
  });
});

describe("reservationNoteBody", () => {
  it("formats as lockName-PIN", () => {
    expect(reservationNoteBody({ lockName: "LL-239", pin: "445572" })).toBe("LL-239-445572");
    expect(reservationNoteBody({ lockName: "KE-105", pin: "1234" })).toBe("KE-105-1234");
  });
});

describe("isPaidInFull", () => {
  it("is true when balance is zero", () => {
    expect(isPaidInFull(0)).toBe(true);
    expect(isPaidInFull("0")).toBe(true);
    expect(isPaidInFull("0.00")).toBe(true);
  });
  it("is true when overpaid (credit balance)", () => {
    expect(isPaidInFull(-5)).toBe(true);
  });
  it("is false when a balance remains", () => {
    expect(isPaidInFull(180.5)).toBe(false);
    expect(isPaidInFull("180.50")).toBe(false);
  });
  it("is false when balance is unknown (fail closed — no code until confirmed paid)", () => {
    expect(isPaidInFull(null)).toBe(false);
    expect(isPaidInFull(undefined)).toBe(false);
    expect(isPaidInFull("")).toBe(false);
    expect(isPaidInFull("abc")).toBe(false);
  });
});
