import { describe, it, expect } from "vitest";
import { makeDistinctPins } from "./backup-codes";

describe("makeDistinctPins", () => {
  it("returns the requested count, all distinct", () => {
    const pins = makeDistinctPins(5);
    expect(pins).toHaveLength(5);
    expect(new Set(pins).size).toBe(5);
  });

  it("retries past collisions from the generator", () => {
    // Generator yields a duplicate first, then unique values.
    const seq = ["1111", "1111", "2222", "3333"];
    let i = 0;
    const pins = makeDistinctPins(3, () => seq[i++]);
    expect(pins).toEqual(["1111", "2222", "3333"]);
  });

  it("throws if it cannot reach the distinct count", () => {
    expect(() => makeDistinctPins(3, () => "0000")).toThrow();
  });
});
