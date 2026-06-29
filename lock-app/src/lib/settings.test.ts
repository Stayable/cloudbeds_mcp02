import { describe, it, expect } from "vitest";
import { clampGrace, CHECKOUT_GRACE_MAX, TRANSFER_GRACE_MAX } from "./settings";

describe("clampGrace", () => {
  it("keeps an in-range whole number", () => {
    expect(clampGrace("30", CHECKOUT_GRACE_MAX)).toBe(30);
  });
  it("caps at the max", () => {
    expect(clampGrace("999", CHECKOUT_GRACE_MAX)).toBe(CHECKOUT_GRACE_MAX);
    expect(clampGrace("999", TRANSFER_GRACE_MAX)).toBe(TRANSFER_GRACE_MAX);
  });
  it("floors negatives to 0", () => {
    expect(clampGrace("-5", CHECKOUT_GRACE_MAX)).toBe(0);
  });
  it("rounds fractional input", () => {
    expect(clampGrace("12.7", CHECKOUT_GRACE_MAX)).toBe(13);
  });
  it("treats blank / non-numeric / null as 0", () => {
    expect(clampGrace("", CHECKOUT_GRACE_MAX)).toBe(0);
    expect(clampGrace("abc", CHECKOUT_GRACE_MAX)).toBe(0);
    expect(clampGrace(null, CHECKOUT_GRACE_MAX)).toBe(0);
  });
});
