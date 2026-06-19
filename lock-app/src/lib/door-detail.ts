/**
 * Pure view-model for the Door/Room detail screen. Turns raw Passcode rows into
 * displayable code rows and buckets them into the panels the page renders
 * (active guest code, staff backup code, active manual codes, and history).
 */
import { maskPin } from "./rooms";

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
}

export interface CodeRow {
  keyboardPwdId: string;
  maskedPin: string;
  type: string;
  status: CodeStatus;
  window: string;
  reservationId: string | null;
}

export function classifyCode(p: PasscodeInput, nowMs: number): CodeStatus {
  if (p.status === "revoked") return "revoked";
  if (p.status === "failed") return "revoked";
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
  };
}

export function splitCodes(rows: PasscodeInput[], nowMs: number) {
  let guest: CodeRow | null = null;
  let backup: CodeRow | null = null;
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
    else if (p.type === "backup" && !backup) backup = row;
    else if (p.type === "manual") manual.push(row);
    else history.push(row); // a second active code of a singleton type — surface it
  }
  return { guest, backup, manual, history };
}
