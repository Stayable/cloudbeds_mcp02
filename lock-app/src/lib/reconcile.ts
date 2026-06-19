/**
 * Pure drift detection for "Sync from lock" (spec §10). TTLock returns 200 even
 * when a command never reached a lock, so we list the lock's real passcodes and
 * diff them against what our DB believes is active. The Server Action does the
 * I/O; this does the comparison.
 */
export interface DriftResult {
  /** Active in our DB but NOT on the lock — potential guest lockout. */
  missingOnLock: string[];
  /** On the lock but not tracked by us — stale/foreign code. */
  orphanOnLock: string[];
  inSync: boolean;
}

export function detectDrift(dbActiveIds: string[], lockPwdIds: string[]): DriftResult {
  const onLock = new Set(lockPwdIds);
  const inDb = new Set(dbActiveIds);
  const missingOnLock = dbActiveIds.filter((id) => !onLock.has(id));
  const orphanOnLock = lockPwdIds.filter((id) => !inDb.has(id));
  return { missingOnLock, orphanOnLock, inSync: missingOnLock.length === 0 && orphanOnLock.length === 0 };
}
