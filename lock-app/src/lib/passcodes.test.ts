import { describe, it, expect } from "vitest";
import {
  generatePin, guestValidityWindow, manualValidityWindow, PIN_LENGTH,
} from "./passcodes";

describe("generatePin", () => {
  it("returns a PIN_LENGTH string of digits by default", () => {
    const pin = generatePin();
    expect(pin).toHaveLength(PIN_LENGTH);
    expect(pin).toMatch(/^\d+$/);
  });
  it("honors a custom length and never starts with 0 (full-width)", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin(4);
      expect(pin).toHaveLength(4);
      expect(pin[0]).not.toBe("0");
    }
  });
});

describe("guestValidityWindow", () => {
  it("opens at UTC start-of-arrival and closes at UTC end-of-departure", () => {
    const { startTs, endTs } = guestValidityWindow("2026-06-20", "2026-06-22");
    expect(startTs).toBe(Date.parse("2026-06-20T00:00:00Z"));
    expect(endTs).toBe(Date.parse("2026-06-22T23:59:59Z"));
  });
  it("throws on an invalid range", () => {
    expect(() => guestValidityWindow(undefined, "2026-06-22")).toThrow();
  });
});

describe("manualValidityWindow", () => {
  it("spans now to now + hours", () => {
    const now = Date.parse("2026-06-20T12:00:00Z");
    const { startTs, endTs } = manualValidityWindow(now, 24);
    expect(startTs).toBe(now);
    expect(endTs).toBe(now + 24 * 3600 * 1000);
  });
  it("throws on a non-positive duration", () => {
    expect(() => manualValidityWindow(Date.now(), 0)).toThrow();
  });
});
