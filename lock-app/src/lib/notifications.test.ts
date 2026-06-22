import { describe, it, expect } from "vitest";
import { isAlertEvent, unseenCount, recentNotifications, type NotificationItem } from "./notifications";

const mk = (id: string, ms: number, outcome: "warning" | "failed" = "warning"): NotificationItem =>
  ({ id, message: `m${id}`, outcome, createdAt: new Date(ms), roomId: "101", propertyId: "210972" });

describe("isAlertEvent", () => {
  it("flags warning and failed only", () => {
    expect(isAlertEvent("warning")).toBe(true);
    expect(isAlertEvent("failed")).toBe(true);
    expect(isAlertEvent("success")).toBe(false);
    expect(isAlertEvent(undefined)).toBe(false);
  });
});

describe("unseenCount", () => {
  const items = [mk("a", 3000), mk("b", 2000), mk("c", 1000)];
  it("counts items strictly newer than seenAt", () => {
    expect(unseenCount(items, new Date(1500))).toBe(2); // a,b
  });
  it("counts all when never seen", () => {
    expect(unseenCount(items, null)).toBe(3);
  });
  it("counts zero when seenAt is newest", () => {
    expect(unseenCount(items, new Date(3000))).toBe(0);
  });
});

describe("recentNotifications", () => {
  it("sorts newest first and caps at limit", () => {
    const out = recentNotifications([mk("c", 1000), mk("a", 3000), mk("b", 2000)], 2);
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
