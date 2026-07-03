/**
 * Pure classifier for the per-room door access log. Turns raw TTLock unlock
 * records into display rows, labelling each by WHICH code opened the door —
 * matched against the room's Passcode rows so a keypad entry reads "Guest (Res
 * 123)", "LL-Maintenance", "Manual code", or "Other / unknown code". This is the
 * monitoring payoff of the named backup codes. Kept dependency-free (the page does
 * the TTLock fetch + Prisma read and feeds plain objects) so it's reusable if we
 * later ingest records fleet-wide.
 */
import { backupCodeLabel, fullCodeName } from "./code-naming";

export type AccessCredential = "guest" | "backup" | "manual" | "other";

/** The subset of a Passcode row needed to label a record. */
export interface AccessPasscode {
  keyboardPwdId: string;
  pin: string;
  type: string; // guest | backup | manual
  reservationId: string | null;
  backupSlot: number | null;
  label: string | null;
}

/** The subset of a TTLock lockRecord we read (shape VERIFY-LIVE, see ttlock.ts). */
export interface LockRecordInput {
  recordType?: number;
  success?: number; // 1 = success; anything else = failed attempt
  keyboardPwd?: string | null; // the digits entered, for passcode unlocks
  keyboardPwdId?: number | null;
  lockDate: number; // epoch ms
  username?: string | null;
}

export interface AccessRow {
  at: number;
  method: string;
  label: string;
  credential: AccessCredential;
  success: boolean;
}

// TTLock recordType → friendly method label. Authoritative values from the TTLock
// docs (euopen.ttlock.com /doc/api/v3/lockRecord/list). Unknown types fall back to
// "Method <n>" rather than fabricating a meaning.
const METHOD_BY_TYPE: Record<number, string> = {
  1: "App",
  2: "Parking lock touch",
  3: "Gateway (remote)",
  4: "Keypad code",
  5: "Parking lock raise",
  6: "Parking lock lower",
  7: "IC card",
  8: "Fingerprint",
  9: "Wristband",
  10: "Mechanical key",
  11: "Bluetooth",
  12: "Gateway (remote)",
  29: "Unexpected unlock",
  30: "Door sensor: closed",
  31: "Door sensor: open",
  32: "Opened from inside",
  33: "Locked (fingerprint)",
  34: "Locked (keypad code)",
  35: "Locked (IC card)",
  36: "Locked (mechanical key)",
  37: "Remote control",
  44: "Tamper alert",
  45: "Auto-lock",
  46: "Unlock key",
  47: "Lock key",
  48: "Too many invalid codes",
};

function methodLabel(recordType?: number): string {
  if (recordType != null && METHOD_BY_TYPE[recordType]) return METHOD_BY_TYPE[recordType];
  return recordType != null ? `Method ${recordType}` : "Unknown";
}

function findPasscode(rec: LockRecordInput, passcodes: AccessPasscode[]): AccessPasscode | undefined {
  if (rec.keyboardPwdId != null) {
    const byId = passcodes.find((p) => p.keyboardPwdId === String(rec.keyboardPwdId));
    if (byId) return byId;
  }
  if (rec.keyboardPwd) return passcodes.find((p) => p.pin === rec.keyboardPwd);
  return undefined;
}

function labelFor(p: AccessPasscode, abbr: string): { label: string; credential: AccessCredential } {
  if (p.type === "guest") {
    return { credential: "guest", label: p.reservationId ? `Guest (Res ${p.reservationId})` : "Guest code" };
  }
  if (p.type === "backup") {
    const slot = p.backupSlot ?? 1;
    return { credential: "backup", label: fullCodeName(abbr, backupCodeLabel(slot, p.label)) };
  }
  if (p.type === "manual") return { credential: "manual", label: "Manual code" };
  return { credential: "other", label: "Other / unknown code" };
}

export function classifyAccessRecord(rec: LockRecordInput, passcodes: AccessPasscode[], abbr: string): AccessRow {
  const method = methodLabel(rec.recordType);
  const success = rec.success === 1;
  // A code was involved when the record carries the entered PIN or a keyboardPwdId.
  const hasCode = !!rec.keyboardPwd || rec.keyboardPwdId != null;
  const match = hasCode ? findPasscode(rec, passcodes) : undefined;
  let label: string;
  let credential: AccessCredential;
  if (match) {
    ({ label, credential } = labelFor(match, abbr));
  } else if (rec.keyboardPwd) {
    label = "Other / unknown code"; // a PIN we never issued (or since deleted)
    credential = "other";
  } else {
    label = method; // non-code event (mechanical key, app, sensor, …)
    credential = "other";
  }
  return { at: rec.lockDate, method, label, credential, success };
}

/** Classify a batch of records, newest-first. */
export function buildAccessRows(recs: LockRecordInput[], passcodes: AccessPasscode[], abbr: string): AccessRow[] {
  return recs.map((r) => classifyAccessRecord(r, passcodes, abbr)).sort((a, b) => b.at - a.at);
}

const CSV_HEADERS = ["Time (local)", "Time (UTC)", "Who / code", "Type", "Method", "Result"];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Serialize access rows to CSV. Local time is formatted in the property timezone. */
export function accessRowsToCsv(rows: AccessRow[], timeZone: string): string {
  const local = (ms: number) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(new Date(ms));
  const body = rows
    .map((r) => [local(r.at), new Date(r.at).toISOString(), r.label, r.credential, r.method, r.success ? "success" : "failed"].map(csvCell).join(","))
    .join("\n");
  return `${CSV_HEADERS.join(",")}\n${body}\n`;
}
