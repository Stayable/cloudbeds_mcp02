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

// TTLock recordType → friendly method, for NON-passcode unlocks (a keypad entry is
// labelled "Keypad code" directly). Numbers are best-known; unknowns fall back.
const METHOD_BY_TYPE: Record<number, string> = {
  1: "App / Bluetooth",
  4: "Keypad code",
  7: "IC card",
  8: "Fingerprint",
  9: "Keypad code",
  46: "Auto-lock",
  47: "Manual (thumb-turn)",
};

function methodLabel(rec: LockRecordInput, isKeypad: boolean): string {
  if (isKeypad) return "Keypad code";
  if (rec.recordType != null && METHOD_BY_TYPE[rec.recordType]) return METHOD_BY_TYPE[rec.recordType];
  return rec.recordType != null ? `Method ${rec.recordType}` : "Unknown";
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
  const isKeypad = !!rec.keyboardPwd || rec.recordType === 4 || rec.recordType === 9;
  const success = rec.success === 1;
  const match = isKeypad ? findPasscode(rec, passcodes) : undefined;
  const { label, credential } = match
    ? labelFor(match, abbr)
    : isKeypad
      ? { label: "Other / unknown code", credential: "other" as const }
      : { label: methodLabel(rec, false), credential: "other" as const };
  return { at: rec.lockDate, method: methodLabel(rec, isKeypad), label, credential, success };
}

/** Classify a batch of records, newest-first. */
export function buildAccessRows(recs: LockRecordInput[], passcodes: AccessPasscode[], abbr: string): AccessRow[] {
  return recs.map((r) => classifyAccessRecord(r, passcodes, abbr)).sort((a, b) => b.at - a.at);
}
