import { describe, it, expect } from "vitest";
import { inferGatewayProperty, toGatewayRow } from "./gateway-view";

describe("inferGatewayProperty", () => {
  it("returns the most common non-null propertyId", () => {
    expect(inferGatewayProperty(["210972", "210972", "208155"])).toBe("210972");
  });
  it("ignores nulls when counting", () => {
    expect(inferGatewayProperty([null, "208155", null])).toBe("208155");
  });
  it("returns null when empty or all-null", () => {
    expect(inferGatewayProperty([])).toBeNull();
    expect(inferGatewayProperty([null, null])).toBeNull();
  });
  it("breaks ties by first-seen for determinism", () => {
    expect(inferGatewayProperty(["208155", "210972", "210972", "208155"])).toBe("208155");
  });
});

describe("toGatewayRow", () => {
  const seen = new Date("2026-06-29T10:30:00Z");
  it("maps a DB gateway row to display fields (BigInt→string, formatted lastSeen)", () => {
    const row = toGatewayRow({ gatewayId: 99n, name: "LL-GW-1", online: true, lockCount: 12, lastSeen: seen });
    expect(row.gatewayId).toBe("99");
    expect(row.name).toBe("LL-GW-1");
    expect(row.online).toBe(true);
    expect(row.lockCount).toBe(12);
    expect(row.lastSeen).toBe("2026-06-29 10:30");
  });
  it("tolerates null lockCount/lastSeen", () => {
    const row = toGatewayRow({ gatewayId: 1n, name: "GW", online: false, lockCount: null, lastSeen: null });
    expect(row.lockCount).toBeNull();
    expect(row.lastSeen).toBeNull();
  });
});
