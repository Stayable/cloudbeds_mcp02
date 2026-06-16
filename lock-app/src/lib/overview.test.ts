import { describe, it, expect } from "vitest";
import { summarizeProperty, type LockHealth } from "./overview";
import { getProperty } from "./properties";

const lakeland = getProperty("210972")!;

describe("summarizeProperty", () => {
  it("counts online / offline / low-battery and derives needsAttention", () => {
    const locks: LockHealth[] = [
      { online: true, battery: 90 },
      { online: true, battery: 10 }, // low battery
      { online: false, battery: 50 }, // offline
      { online: false, battery: 5 }, // offline AND low -> counts once toward needsAttention
    ];
    const s = summarizeProperty(lakeland, locks);
    expect(s).toMatchObject({
      propertyId: "210972",
      name: "Lakeland",
      totalLocks: 4,
      online: 2,
      offline: 2,
      lowBattery: 2,
      needsAttention: 3, // unique locks that are offline OR low battery
    });
  });

  it("treats a property with no locks as all-zero", () => {
    expect(summarizeProperty(lakeland, [])).toMatchObject({
      totalLocks: 0, online: 0, offline: 0, lowBattery: 0, needsAttention: 0,
    });
  });

  it("ignores null battery for the low-battery count", () => {
    const s = summarizeProperty(lakeland, [{ online: true, battery: null }]);
    expect(s.lowBattery).toBe(0);
    expect(s.needsAttention).toBe(0);
  });
});
