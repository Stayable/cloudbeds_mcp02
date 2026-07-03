import { describe, it, expect } from "vitest";
import { classifyAccessRecord, buildAccessRows, accessRowsToCsv, type AccessPasscode, type LockRecordInput } from "./door-log";

const passcodes: AccessPasscode[] = [
  { keyboardPwdId: "11", pin: "4821", type: "guest", reservationId: "R1", backupSlot: null, label: null },
  { keyboardPwdId: "12", pin: "7777", type: "backup", reservationId: null, backupSlot: 1, label: "Maintenance" },
  { keyboardPwdId: "13", pin: "5555", type: "backup", reservationId: null, backupSlot: 2, label: null },
  { keyboardPwdId: "14", pin: "9090", type: "manual", reservationId: null, backupSlot: null, label: null },
];
const PREFIX = "LL231"; // <ABBR><roomNumber>

function rec(over: Partial<LockRecordInput>): LockRecordInput {
  return { recordType: 4, success: 1, lockDate: 1_700_000_000_000, ...over };
}

describe("classifyAccessRecord", () => {
  it("labels a guest code with its reservation", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "4821" }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "guest", label: "Guest (Res R1)", method: "Keypad code", success: true });
  });
  it("labels a named backup code as <prefix>-<name>", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "7777" }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "backup", label: "LL231-Maintenance" });
  });
  it("labels an unnamed backup code with its default slot name", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "5555" }), passcodes, PREFIX);
    expect(r.label).toBe("LL231-Backup 2");
  });
  it("labels a manual code", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "9090" }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "manual", label: "Manual code" });
  });
  it("matches by keyboardPwdId when present, even if digits differ", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "0000", keyboardPwdId: 12 }), passcodes, PREFIX);
    expect(r.label).toBe("LL231-Maintenance");
  });
  it("marks an unknown keypad code as other", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "1234" }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "other", label: "Other / unknown code", method: "Keypad code" });
  });
  it("labels a non-passcode unlock by its method", () => {
    const r = classifyAccessRecord(rec({ recordType: 1, keyboardPwd: null }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "other", label: "App", method: "App" });
  });
  it("labels a mechanical-key unlock (recordType 10)", () => {
    const r = classifyAccessRecord(rec({ recordType: 10, keyboardPwd: null }), passcodes, PREFIX);
    expect(r).toMatchObject({ credential: "other", label: "Mechanical key", method: "Mechanical key" });
  });
  it("falls back to 'Method <n>' for an unmapped recordType", () => {
    const r = classifyAccessRecord(rec({ recordType: 99, keyboardPwd: null }), passcodes, PREFIX);
    expect(r.method).toBe("Method 99");
  });
  it("flags a failed attempt", () => {
    const r = classifyAccessRecord(rec({ keyboardPwd: "1234", success: 0 }), passcodes, PREFIX);
    expect(r.success).toBe(false);
  });
});

describe("buildAccessRows", () => {
  it("returns rows newest-first", () => {
    const rows = buildAccessRows(
      [rec({ keyboardPwd: "4821", lockDate: 100 }), rec({ keyboardPwd: "7777", lockDate: 300 }), rec({ keyboardPwd: "9090", lockDate: 200 })],
      passcodes, PREFIX,
    );
    expect(rows.map((r) => r.at)).toEqual([300, 200, 100]);
  });
});

describe("accessRowsToCsv", () => {
  it("emits a header and one line per row, with the credential + result", () => {
    const rows = buildAccessRows([rec({ keyboardPwd: "4821" }), rec({ recordType: 10, keyboardPwd: null, success: 0 })], passcodes, PREFIX);
    const csv = accessRowsToCsv(rows, "America/New_York");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Time (local),Time (UTC),Who / code,Type,Method,Result");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(csv).toContain("Guest (Res R1)");
    expect(csv).toContain("guest");
    expect(csv).toContain("failed");
  });
  it("quotes a value containing a comma", () => {
    const custom: AccessPasscode[] = [{ keyboardPwdId: "20", pin: "1212", type: "backup", reservationId: null, backupSlot: 1, label: "Front Desk, AM" }];
    const rows = buildAccessRows([rec({ keyboardPwd: "1212" })], custom, "LL");
    expect(accessRowsToCsv(rows, "America/New_York")).toContain('"LL-Front Desk, AM"');
  });
});
