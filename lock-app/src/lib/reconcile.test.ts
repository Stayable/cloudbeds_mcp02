import { describe, it, expect } from "vitest";
import { detectDrift } from "./reconcile";

describe("detectDrift", () => {
  it("reports in-sync when the sets match (order-independent)", () => {
    expect(detectDrift(["1", "2"], ["2", "1"])).toEqual({
      missingOnLock: [], orphanOnLock: [], inSync: true,
    });
  });
  it("flags a DB code absent from the lock as missingOnLock (lockout risk)", () => {
    const r = detectDrift(["1", "2"], ["1"]);
    expect(r.missingOnLock).toEqual(["2"]);
    expect(r.orphanOnLock).toEqual([]);
    expect(r.inSync).toBe(false);
  });
  it("flags a lock code we don't track as orphanOnLock", () => {
    const r = detectDrift(["1"], ["1", "9"]);
    expect(r.orphanOnLock).toEqual(["9"]);
    expect(r.missingOnLock).toEqual([]);
    expect(r.inSync).toBe(false);
  });
});
