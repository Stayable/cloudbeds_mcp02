/**
 * Pure view-model for the Door/Room detail screen. Turns raw Passcode rows into
 * displayable code rows and buckets them into the panels the page renders
 * (active guest code, staff backup code, active manual codes, and history).
 */
import { maskPin } from "./rooms";

/** Number of independent staff backup-PIN slots per lock (each rotatable). */
export const BACKUP_SLOTS = 5;

export type CodeStatus = "active" | "expired" | "revoked";

export interface PasscodeInput {
  keyboardPwdId: string;
  pin: string;
  type: string;
  status: string;
  startTs: number;
  endTs: number;
  reservationId: string | null;
  createdAt: number;
  /** Backup-only: which slot (1..BACKUP_SLOTS) this code occupies. Legacy rows are null → slot 1. */
  backupSlot?: number | null;
  /** Backup-only: descriptive label part (no <ABBR> prefix), e.g. "Maintenance". Null → default. */
  label?: string | null;
}

export interface CodeRow {
  keyboardPwdId: string;
  maskedPin: string;
  type: string;
  status: CodeStatus;
  window: string;
  reservationId: string | null;
  /** Backup-only: descriptive label part (no prefix); null when unset. */
  label: string | null;
}

export function classifyCode(p: PasscodeInput, nowMs: number): CodeStatus {
  if (p.status === "revoked") return "revoked";
  if (p.status === "failed") return "revoked";
  // "expiring" = a code in its grace window after checkout/transfer: logically
  // gone (room is vacant), still physically working for a few minutes. It must
  // NOT occupy the active-guest slot, so treat it as expired for display.
  if (p.status === "expiring") return "expired";
  // endTs 0 marks a permanent (backup) code — never expires by time.
  if (p.endTs > 0 && p.endTs < nowMs) return "expired";
  return "active";
}

function windowLabel(p: PasscodeInput): string {
  if (p.endTs === 0) return "permanent";
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  return `${fmt(p.startTs)} → ${fmt(p.endTs)} UTC`;
}

export function toCodeRow(p: PasscodeInput, nowMs: number): CodeRow {
  return {
    keyboardPwdId: p.keyboardPwdId,
    maskedPin: maskPin(p.pin),
    type: p.type,
    status: classifyCode(p, nowMs),
    window: windowLabel(p),
    reservationId: p.reservationId,
    label: p.label ?? null,
  };
}

/** Backup slot a code occupies (1..BACKUP_SLOTS); legacy rows with no slot → 1. */
function backupSlotOf(p: PasscodeInput): number {
  const s = p.backupSlot ?? 1;
  return s >= 1 && s <= BACKUP_SLOTS ? s : 1;
}

export function splitCodes(rows: PasscodeInput[], nowMs: number) {
  let guest: CodeRow | null = null;
  // One active code per backup slot (1-indexed); null = slot empty.
  const backups: (CodeRow | null)[] = Array(BACKUP_SLOTS).fill(null);
  const manual: CodeRow[] = [];
  const history: CodeRow[] = [];
  // History newest-first; deterministic ordering independent of input order.
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  for (const p of sorted) {
    const row = toCodeRow(p, nowMs);
    if (row.status !== "active") {
      history.push(row);
      continue;
    }
    if (p.type === "guest" && !guest) guest = row;
    else if (p.type === "backup") {
      const i = backupSlotOf(p) - 1;
      if (!backups[i]) backups[i] = row;
      else history.push(row); // a second active code in the same slot — surface it
    }
    else if (p.type === "manual") manual.push(row);
    else history.push(row); // a second active code of a singleton type — surface it
  }
  return { guest, backups, manual, history };
}
