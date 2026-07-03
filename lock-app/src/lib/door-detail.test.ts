import { describe, it, expect } from "vitest";
import { classifyCode, splitCodes, BACKUP_SLOTS, type PasscodeInput } from "./door-detail";

const NOW = Date.parse("2026-06-20T12:00:00Z");
const base: PasscodeInput = {
  keyboardPwdId: "1", pin: "123472", type: "guest", status: "active",
  startTs: NOW - 3600_000, endTs: NOW + 3600_000, reservationId: "R1", createdAt: NOW - 7200_000,
};

describe("classifyCode", () => {
  it("is revoked when status is revoked, regardless of window", () => {
    expect(classifyCode({ ...base, status: "revoked" }, NOW)).toBe("revoked");
  });
  it("is expired when a period code's endTs has passed", () => {
    expect(classifyCode({ ...base, endTs: NOW - 1 }, NOW)).toBe("expired");
  });
  it("is active within the window", () => {
    expect(classifyCode(base, NOW)).toBe("active");
  });
  it("treats a permanent backup code (endTs 0) as active", () => {
    expect(classifyCode({ ...base, type: "backup", endTs: 0 }, NOW)).toBe("active");
  });
  it("treats an 'expiring' (grace, winding-down) code as not-active", () => {
    // status expiring = logically revoked, physically lingering during its grace
    // window — must NOT show as the room's active guest code.
    expect(classifyCode({ ...base, status: "expiring", endTs: NOW + 600_000 }, NOW)).toBe("expired");
  });
});

describe("splitCodes carries the backup label", () => {
  it("passes a backup code's label onto its CodeRow", () => {
    const rows: PasscodeInput[] = [
      { ...base, keyboardPwdId: "b1", type: "backup", endTs: 0, backupSlot: 1, label: "Maintenance" },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.backups[0]?.label).toBe("Maintenance");
  });
  it("leaves label null when unset", () => {
    const rows: PasscodeInput[] = [
      { ...base, keyboardPwdId: "b2", type: "backup", endTs: 0, backupSlot: 2 },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.backups[1]?.label).toBeNull();
  });
});

describe("splitCodes with an expiring code", () => {
  it("keeps an expiring guest code out of the active slot (sends it to history)", () => {
    const rows: PasscodeInput[] = [
      { ...base, keyboardPwdId: "exp", status: "expiring", endTs: NOW + 600_000 },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.guest).toBeNull();
    expect(out.history.map((h) => h.keyboardPwdId)).toContain("exp");
  });
});

describe("splitCodes", () => {
  it("buckets active guest/backup/manual and pushes the rest to history newest-first", () => {
    const rows: PasscodeInput[] = [
      base,
      { ...base, keyboardPwdId: "2", type: "backup", endTs: 0, reservationId: null, backupSlot: 1 },
      { ...base, keyboardPwdId: "3", type: "manual", reservationId: null },
      { ...base, keyboardPwdId: "4", status: "revoked", createdAt: NOW - 1000 },
      { ...base, keyboardPwdId: "5", endTs: NOW - 1, createdAt: NOW - 500 },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.guest?.keyboardPwdId).toBe("1");
    expect(out.backups[0]?.keyboardPwdId).toBe("2");
    expect(out.manual.map((m) => m.keyboardPwdId)).toEqual(["3"]);
    expect(out.history.map((h) => h.keyboardPwdId)).toEqual(["5", "4"]);
    expect(out.guest?.maskedPin).toBe("••••72");
  });
});

describe("splitCodes backup slots", () => {
  const bk = (id: string, slot: number | null): PasscodeInput =>
    ({ ...base, keyboardPwdId: id, type: "backup", endTs: 0, reservationId: null, backupSlot: slot });

  it("returns BACKUP_SLOTS slots, placing active backups 1-indexed with null for empties", () => {
    const out = splitCodes([bk("b1", 1), bk("b3", 3)], NOW);
    expect(out.backups).toHaveLength(BACKUP_SLOTS);
    expect(out.backups[0]?.keyboardPwdId).toBe("b1");
    expect(out.backups[1]).toBeNull();
    expect(out.backups[2]?.keyboardPwdId).toBe("b3");
    expect(out.backups[4]).toBeNull();
  });

  it("treats a legacy backup code with no slot as slot 1", () => {
    const out = splitCodes([bk("legacy", null)], NOW);
    expect(out.backups[0]?.keyboardPwdId).toBe("legacy");
  });

  it("sends a second active backup in the same slot to history (keeps the newest)", () => {
    const newer = { ...bk("new", 2), createdAt: NOW };
    const older = { ...bk("old", 2), createdAt: NOW - 1000 };
    const out = splitCodes([older, newer], NOW);
    expect(out.backups[1]?.keyboardPwdId).toBe("new");
    expect(out.history.map((h) => h.keyboardPwdId)).toContain("old");
  });
});
