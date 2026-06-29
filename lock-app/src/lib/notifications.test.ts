import { describe, it, expect } from "vitest";
import { isAlertEvent, isBellEvent, unseenCount, recentNotifications, type NotificationItem } from "./notifications";

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

describe("isBellEvent", () => {
  it("surfaces warning/failed events that are not reveals", () => {
    expect(isBellEvent("passcode_create_failed", "failed")).toBe(true);
    expect(isBellEvent("sync_from_lock", "warning")).toBe(true);
  });
  it("excludes reveal actions even when they are warnings", () => {
    expect(isBellEvent("code_revealed", "warning")).toBe(false);
    expect(isBellEvent("backup_code_revealed", "warning")).toBe(false);
  });
  it("excludes non-alert outcomes regardless of action", () => {
    expect(isBellEvent("sync_from_lock", "success")).toBe(false);
    expect(isBellEvent("manual_code_created", undefined)).toBe(false);
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
