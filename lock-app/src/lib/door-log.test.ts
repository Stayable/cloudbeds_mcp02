import { describe, it, expect } from "vitest";
import { classifyAccessRecord, buildAccessRows, type AccessPasscode, type LockRecordInput } from "./door-log";

const passcodes: AccessPasscode[] = [
  { keyboardPwdId: "11", pin: "4821", type: "guest", reservationId: "R1", backupSlot: null, label: null },
  { keyboardPwdId: "12", pin: "7777", type: "backup", reservationId: null, backupSlot: 1, label: "Maintenance" },
  { keyboardPwdId: "13", pin: "5555", type: "backup", reservationId: null, backupSlot: 2, label: null },
  { keyboardPwdId: "14", pin: "9090", type: "manual", reservationId: null, backupSlot: null, label: null },
];
const ABBR = "LL";

function rec(over: Partial<LockRecordInput>): LockRecordInput {
  return { recordType: 4, success: 1, lockDate: 1_700_000_000_000, ...over };
}

describe("classifyAccessRecord", () => {
  it("labels a guest code with its reservation", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "4821" }), passcodes, ABBR);
    expect(r).toMatchObject({ credential: "guest", label: "Guest (Res R1)", method: "Keypad code", success: true });
  });
  it("labels a named backup code as <ABBR>-<name>", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "7777" }), passcodes, ABBR);
    expect(r).toMatchObject({ credential: "backup", label: "LL-Maintenance" });
  });
  it("labels an unnamed backup code with its default slot name", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "5555" }), passcodes, ABBR);
    expect(r.label).toBe("LL-Backup 2");
  });
  it("labels a manual code", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "9090" }), passcodes, ABBR);
    expect(r).toMatchObject({ credential: "manual", label: "Manual code" });
  });
  it("matches by keyboardPwdId when present, even if digits differ", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "0000", keyboardPwdId: 12 }), passcodes, ABBR);
    expect(r.label).toBe("LL-Maintenance");
  });
  it("marks an unknown keypad code as other", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "1234" }), passcodes, ABBR);
    expect(r).toMatchObject({ credential: "other", label: "Other / unknown code", method: "Keypad code" });
  });
  it("labels a non-passcode unlock by its method", () => {
    const r = classifyAccessRecord(rec({ recordType: 1, keyboardPwd: null }), passcodes, ABBR);
    expect(r).toMatchObject({ credential: "other", method: "App / Bluetooth" });
  });
  it("flags a failed attempt", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "1234", success: 0 }), passcodes, ABBR);
    expect(r.success).toBe(false);
  });
});

describe("buildAccessRows", () => {
  it("returns rows newest-first", () => {
    const rows = buildAccessRows(
      [rec({ keyboardPwd: "4821", lockDate: 100 }), rec({ keyboardPwd: "7777", lockDate: 300 }), rec({ keyboardPwd: "9090", lockDate: 200 })],
      passcodes, ABBR,
    );
    expect(rows.map((r) => r.at)).toEqual([300, 200, 100]);
  });
});
