import { describe, it, expect } from "vitest";
import { classifyCode, splitCodes, type PasscodeInput } from "./door-detail";

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
});

describe("splitCodes", () => {
  it("buckets active guest/backup/manual and pushes the rest to history newest-first", () => {
    const rows: PasscodeInput[] = [
      base,
      { ...base, keyboardPwdId: "2", type: "backup", endTs: 0, reservationId: null },
      { ...base, keyboardPwdId: "3", type: "manual", reservationId: null },
      { ...base, keyboardPwdId: "4", status: "revoked", createdAt: NOW - 1000 },
      { ...base, keyboardPwdId: "5", endTs: NOW - 1, createdAt: NOW - 500 },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.guest?.keyboardPwdId).toBe("1");
    expect(out.backup?.keyboardPwdId).toBe("2");
    expect(out.manual.map((m) => m.keyboardPwdId)).toEqual(["3"]);
    expect(out.history.map((h) => h.keyboardPwdId)).toEqual(["5", "4"]);
    expect(out.guest?.maskedPin).toBe("••••72");
  });
});
