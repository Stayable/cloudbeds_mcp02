import { describe, it, expect } from "vitest";
import { generateOtpCode, otpMatches } from "./otp";

describe("generateOtpCode", () => {
  it("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe("otpMatches", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  const future = new Date("2026-06-23T12:10:00Z");
  const past = new Date("2026-06-23T11:50:00Z");

  it("accepts a matching, unused, unexpired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "123456", now)).toBe(true);
  });
  it("rejects a wrong code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "000000", now)).toBe(false);
  });
  it("rejects a used code", () => {
    expect(otpMatches({ code: "123456", used: true, expiresAt: future }, "123456", now)).toBe(false);
  });
  it("rejects an expired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: past }, "123456", now)).toBe(false);
  });
  it("rejects a null stored code", () => {
    expect(otpMatches({ code: null, used: false, expiresAt: future }, "123456", now)).toBe(false);
  });
});
