/**
 * Server-side loader for the per-room door access log. Live-fetches a lock's
 * recent TTLock unlock records and classifies them against the room's passcodes.
 * NEVER throws — returns null on any error (missing creds, offline lock, unverified
 * endpoint) so the page degrades to "unavailable" instead of crashing, mirroring
 * the guest-details loader. Returns [] when the lock simply has no recent activity.
 */
import { listLockRecords, type ListLockRecordsOpts } from "./ttlock";
import { buildAccessRows, type AccessRow, type AccessPasscode } from "./door-log";

const MAX_ROWS = 200;

export async function loadAccessRows(
  lockId: bigint,
  passcodes: AccessPasscode[],
  prefix: string,
  window: Pick<ListLockRecordsOpts, "startDate" | "endDate"> = {},
): Promise<AccessRow[] | null> {
  try {
    const { list } = await listLockRecords(lockId, { ...window, pageSize: 100 });
    return buildAccessRows(list, passcodes, prefix).slice(0, MAX_ROWS);
  } catch {
    return null;
  }
}
