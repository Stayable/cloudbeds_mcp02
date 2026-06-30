import { describe, it, expect } from "vitest";
import { lockStatusFrom } from "./lock-fault";
import { BACKUP_SLOTS } from "./door-detail";

describe("lockStatusFrom", () => {
  it("offline when not reachable, regardless of backups", () => {
    expect(lockStatusFrom({ online: false, mapped: true, activeBackups: BACKUP_SLOTS })).toBe("offline");
    expect(lockStatusFrom({ online: false, mapped: false, activeBackups: 0 })).toBe("offline");
  });

  it("issue when reachable + mapped but backups incomplete", () => {
    expect(lockStatusFrom({ online: true, mapped: true, activeBackups: 1 })).toBe("issue");
    expect(lockStatusFrom({ online: true, mapped: true, activeBackups: BACKUP_SLOTS - 1 })).toBe("issue");
  });

  it("online when reachable + complete (or unmapped, where backups aren't expected)", () => {
    expect(lockStatusFrom({ online: true, mapped: true, activeBackups: BACKUP_SLOTS })).toBe("online");
    expect(lockStatusFrom({ online: true, mapped: false, activeBackups: 0 })).toBe("online");
  });
});
