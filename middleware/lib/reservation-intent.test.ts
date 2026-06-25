import { describe, it, expect } from "vitest";
import { classifyIntent, reservationNoteBody, isPaidInFull } from "./reservation-intent";

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
