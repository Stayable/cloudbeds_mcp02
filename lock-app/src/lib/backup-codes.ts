/**
 * Backup-code lifecycle shared by the mapping actions (assign/unmap) and the
 * gateway/health cron. A backup code is a PERMANENT keypad code that physically
 * lives on the lock, so when a lock changes rooms the codes must be revoked and
 * regenerated for the new room — never silently carried over in the DB.
 *
 * See lock-actions.ts for where these run:
 *   - unmap  → revokeAllCodesForLock (pooled lock = clean slate)
 *   - assign → revokeAllCodesForLock + generateBackupCodesForRoom (fresh per room)
 */
import { prisma } from "./db";
import { createPasscode, deletePasscode } from "./ttlock";
import { generatePin, BACKUP_PWD_TYPE } from "./passcodes";
import { BACKUP_SLOTS } from "./door-detail";
import { backupCodeLabel, fullCodeName } from "./code-naming";
import { getProperty } from "./properties";

// TTLock rate-limits rapid writes to the same lock. An assign fires several in a
// row (rename → delete old codes → create N new), so doing them back-to-back makes
// the later calls fail. Space every TTLock write out, and back off before a single
// retry. Slower, but the assign shows a loading overlay so it's clearly working.
// Gateway-relayed writes are slow and TTLock rate-limits bursts, so space them
// generously — reliability over speed (the UI shows a loading overlay throughout).
const TTLOCK_WRITE_SPACING_MS = 1300;
const BACKUP_RETRY_BACKOFF_MS = 2000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Generate `n` DISTINCT PINs. TTLock rejects two identical passcodes on the same
 * lock, so the five backup slots must not collide. Pure (generator injected) so
 * it can be unit-tested deterministically.
 */
export function makeDistinctPins(n: number, generate: () => string = generatePin): string[] {
  const pins = new Set<string>();
  let guard = 0;
  while (pins.size < n) {
    pins.add(generate());
    if (++guard > n * 100) throw new Error(`could not generate ${n} distinct PINs`);
  }
  return [...pins];
}

/**
 * Revoke EVERY active code (guest / backup / manual) on a lock: delete it on the
 * physical lock (best-effort — a code already gone must not block cleanup) then
 * mark the DB row revoked and free its activeKey. Used when a lock leaves a room.
 */
export async function revokeAllCodesForLock(lockId: bigint): Promise<{ revoked: number; failed: number }> {
  const codes = await prisma.passcode.findMany({ where: { lockId, status: "active" } });
  let failed = 0;
  for (let i = 0; i < codes.length; i++) {
    // Space EVERY delete (incl. the first — gives a preceding rename room to settle).
    if (codes.length) await sleep(TTLOCK_WRITE_SPACING_MS);
    try {
      await deletePasscode({ lockId: codes[i].lockId, keyboardPwdId: codes[i].keyboardPwdId });
    } catch {
      failed++; // leave it: still mark revoked so the app stops trusting it; physical drift surfaces on sync-from-lock
    }
  }
  if (codes.length) {
    await prisma.passcode.updateMany({ where: { lockId, status: "active" }, data: { status: "revoked", activeKey: null } });
  }
  return { revoked: codes.length, failed };
}

/**
 * Provision a fresh, full set of BACKUP_SLOTS permanent staff codes on `lockId`
 * for the given room. RESILIENT: never throws and never aborts the batch on one
 * failure — each slot is attempted (with one spaced retry) independently, so a
 * single rate-limited/transient error doesn't strand the other slots. Returns
 * how many were created so the caller can tell "all good" / "partial" / "none".
 */
export async function generateBackupCodesForRoom(args: {
  propertyId: string;
  roomId: string;
  lockId: bigint;
}): Promise<{ created: number; failed: number; errors: string[] }> {
  const { propertyId, roomId, lockId } = args;
  const abbr = getProperty(propertyId)?.abbr ?? "";
  const pins = makeDistinctPins(BACKUP_SLOTS);
  let created = 0;
  const errors: string[] = [];

  for (let slot = 1; slot <= BACKUP_SLOTS; slot++) {
    // Space EVERY create (incl. the first — gives the preceding rename/deletes
    // room to settle before we start writing codes).
    await sleep(TTLOCK_WRITE_SPACING_MS);
    const pin = pins[slot - 1];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(BACKUP_RETRY_BACKOFF_MS);
      try {
        const { keyboardPwdId } = await createPasscode({
          lockId, passcode: pin, keyboardPwdType: BACKUP_PWD_TYPE,
          name: fullCodeName(abbr, backupCodeLabel(slot)),
        });
        await prisma.passcode.create({
          data: {
            reservationId: null, propertyId, roomId, lockId,
            keyboardPwdId: BigInt(keyboardPwdId), pin,
            startTs: BigInt(0), endTs: BigInt(0), status: "active", type: "backup", backupSlot: slot,
          },
        });
        created++;
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) errors.push(`slot ${slot}: ${(lastErr as { message?: string })?.message ?? String(lastErr)}`);
  }
  return { created, failed: BACKUP_SLOTS - created, errors };
}
