import { describe, it, expect } from "vitest";
import {
  generatePin, guestValidityWindow, manualValidityWindow, PIN_LENGTH, EASTERN_END_PAD_MS,
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
  it("opens at UTC start-of-arrival", () => {
    const { startTs } = guestValidityWindow("2026-06-20", "2026-06-22");
    expect(startTs).toBe(Date.parse("2026-06-20T00:00:00Z"));
  });
  it("closes at end-of-departure-day padded to cover the US Eastern local day", () => {
    const { endTs } = guestValidityWindow("2026-06-20", "2026-06-22");
    expect(endTs).toBe(Date.parse("2026-06-22T23:59:59Z") + EASTERN_END_PAD_MS);
  });
  it("keeps a code checking out today valid through the evening Eastern (the expiry bug)", () => {
    // 9pm EDT on the checkout day = next-day 01:00 UTC. A UTC-only end (23:59:59Z)
    // would already read expired; the Eastern pad keeps it valid.
    const { endTs } = guestValidityWindow("2026-06-30", "2026-06-30");
    expect(endTs).toBeGreaterThan(Date.parse("2026-07-01T01:00:00Z"));
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
