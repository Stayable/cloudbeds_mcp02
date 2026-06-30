import { describe, it, expect } from "vitest";
import { formatStayDate, firstNameOf, propertyDisplayName } from "./guest-notify";
import { buildGuestEmail } from "./guest-email";

describe("formatStayDate", () => {
  it("formats ISO dates", () => {
    expect(formatStayDate("2026-06-25")).toBe("Jun 25, 2026");
  });
  it("passes through non-ISO and nulls empties", () => {
    expect(formatStayDate("tomorrow")).toBe("tomorrow");
    expect(formatStayDate(null)).toBeNull();
    expect(formatStayDate("")).toBeNull();
  });
});

describe("firstNameOf", () => {
  it("returns the first token, null when empty", () => {
    expect(firstNameOf("Alexander Hamilton")).toBe("Alexander");
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("propertyDisplayName", () => {
  it("prefixes known properties with Stayable", () => {
    expect(propertyDisplayName("210972")).toBe("Stayable Lakeland");
  });
  it("falls back to Stayable for unknown ids", () => {
    expect(propertyDisplayName("000000")).toBe("Stayable");
  });
});

// Parity guard: the middleware copy of buildGuestEmail must behave like lock-app's.
describe("buildGuestEmail (middleware copy)", () => {
  const base = { guestFirstName: "Alex", propertyName: "Stayable Lakeland", roomNumber: "239", doorCode: "794490" };
  it("generated shows the code; revoked + code_revoked hide it", () => {
    expect(buildGuestEmail("generated", base).html).toContain("794490");
    expect(buildGuestEmail("revoked", { ...base, doorCode: null }).html).not.toContain("794490");
    expect(buildGuestEmail("code_revoked", { ...base, doorCode: null }).subject.toLowerCase()).toContain("deactivated");
  });
});
