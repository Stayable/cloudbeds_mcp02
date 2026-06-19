/**
 * Pure shaper for EventLog.detail (Json). Plan 2's activity view reads
 * detail.outcome to tint rows (amber = sensitive, red = failed), so every action
 * routes its detail through here to guarantee outcome is present and changes are
 * masked. The DB write itself lives in audit-write.ts.
 */
import { maskPin } from "./rooms";

export type Outcome = "success" | "warning" | "failed";

export interface BuildDetailInput {
  outcome?: Outcome;
  reservationId?: string;
  beforePin?: string;
  afterPin?: string;
  message?: string;
  extra?: Record<string, unknown>;
}

export function buildDetail(input: BuildDetailInput): Record<string, unknown> {
  const detail: Record<string, unknown> = { outcome: input.outcome ?? "success", ...input.extra };
  if (input.reservationId) detail.reservationId = input.reservationId;
  if (input.message) detail.message = input.message;
  if (input.beforePin && input.afterPin) {
    detail.change = `${maskPin(input.beforePin)} → ${maskPin(input.afterPin)}`;
  }
  return detail;
}
