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
  for (const c of codes) {
    try {
      await deletePasscode({ lockId: c.lockId, keyboardPwdId: c.keyboardPwdId });
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
 * for the given room. Throws on the first TTLock failure (e.g. -2012 gateway
 * offline) — callers wrap this so a failure degrades gracefully rather than
 * leaving a half-coded lock unmapped.
 */
export async function generateBackupCodesForRoom(args: {
  propertyId: string;
  roomId: string;
  lockId: bigint;
}): Promise<{ created: number }> {
  const { propertyId, roomId, lockId } = args;
  const pins = makeDistinctPins(BACKUP_SLOTS);
  let created = 0;
  for (let slot = 1; slot <= BACKUP_SLOTS; slot++) {
    const pin = pins[slot - 1];
    const { keyboardPwdId } = await createPasscode({
      lockId, passcode: pin, keyboardPwdType: BACKUP_PWD_TYPE, name: `Backup ${slot}`,
    });
    await prisma.passcode.create({
      data: {
        reservationId: null, propertyId, roomId, lockId,
        keyboardPwdId: BigInt(keyboardPwdId), pin,
        startTs: BigInt(0), endTs: BigInt(0), status: "active", type: "backup", backupSlot: slot,
      },
    });
    created++;
  }
  return { created };
}
