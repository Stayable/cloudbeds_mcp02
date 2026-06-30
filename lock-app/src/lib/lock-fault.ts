/**
 * Surfaces WHY a lock is flagged offline. The `online=false` flag is set when a
 * TTLock write fails (auto-backup-generate on assign, guest-code create, or a
 * code-window change), each of which also writes an EventLog row. This reads the
 * most recent such fault so the lock/room detail pages can explain the red flag
 * instead of just showing "offline".
 */
import { prisma } from "./db";

const FAULT_ACTIONS = ["backup_autogen_failed", "passcode_create_failed", "passcode_period_change_failed"];

const TITLES: Record<string, string> = {
  backup_autogen_failed: "Backup codes couldn't be written to the lock",
  passcode_create_failed: "A guest code couldn't be created on the lock",
  passcode_period_change_failed: "The code's dates couldn't be updated on the lock",
};

export interface LockFault {
  action: string;
  title: string;
  message: string;
  at: Date;
}

/** Human title for a fault action. Pure. */
export function faultTitle(action: string): string {
  return TITLES[action] ?? "The lock couldn't be reached";
}

/** Most recent fault EventLog for a lock, or null if none recorded. */
export async function latestLockFault(lockId: bigint): Promise<LockFault | null> {
  const e = await prisma.eventLog.findFirst({
    where: { lockId, action: { in: FAULT_ACTIONS } },
    orderBy: { createdAt: "desc" },
  });
  if (!e) return null;
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const message = String(d.message ?? d.error ?? "").trim() || "The lock didn't respond — check its connection.";
  return { action: e.action, title: faultTitle(e.action), message, at: e.createdAt };
}
