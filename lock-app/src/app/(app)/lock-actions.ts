"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { renameLock } from "@/lib/ttlock";
import { canonicalLockName, unassignedLockName } from "@/lib/lock-naming";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { loadRoomIndex, resolveNameFromId } from "@/lib/room-resolver";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";
import { mapActionError, type ActionResult } from "@/lib/action-result";
import { revokeAllCodesForLock, generateBackupCodesForRoom } from "@/lib/backup-codes";
import { BACKUP_SLOTS } from "@/lib/door-detail";

/** Revalidate the room detail, devices list, and the lock detail after a change. */
function revalidateLockSurfaces(propertyId: string, roomId: string | null, lockId: bigint): void {
  if (roomId) revalidatePath(`/p/${propertyId}/rooms/${roomId}`);
  revalidatePath(`/p/${propertyId}/devices`);
  revalidatePath(`/p/${propertyId}/devices/${lockId}`);
  revalidatePath(`/p/${propertyId}/dashboard`);
}

/**
 * Assign an existing lock (from the property's available pool) to a room. The
 * lockId + roomId arrive from dropdowns — no free-text IDs. We re-derive the room
 * NUMBER from Cloudbeds (never trusting a client label), rename the lock in TTLock
 * to canonical `<ABBR>-<room>` so its name follows the app, create the mapping,
 * drop any other rows for this lock, and clear it from the pool/queue.
 */
export async function assignLockToRoom(formData: FormData): Promise<ActionResult> {
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "").trim();
  const lockIdRaw = String(formData.get("lockId") ?? "").trim();
  if (!propertyId || !roomId) return { ok: false, error: "Missing room information — reload the page and try again." };
  if (!/^\d+$/.test(lockIdRaw)) return { ok: false, error: "Pick a lock to assign." };
  const user = await requirePermission("mapping.edit", propertyId);
  const lockId = BigInt(lockIdRaw);

  const index = await loadRoomIndex(CloudbedsRegistry.fromEnv(), propertyId);
  if (!index) {
    return { ok: false, error: `No Cloudbeds key for property ${propertyId} — add CLOUDBEDS_API_KEY_${propertyId} so rooms can be resolved.` };
  }
  const roomNumber = resolveNameFromId(index, roomId);
  if (!roomNumber) return { ok: false, error: `Room ${roomId} is not a current Cloudbeds room for this property.` };
  const name = canonicalLockName(propertyId, roomNumber);
  if (!name) return { ok: false, error: "Unknown property or empty room." };

  // The gateway↔lock binding is physical — it does NOT change when the lock moves
  // rooms. Carry the lock's existing gatewayId onto the new mapping so the room
  // doesn't show "not connected" until the next discovery sync.
  const priorMap = await prisma.lockMap.findFirst({ where: { lockId }, select: { gatewayId: true } });
  const priorPool = priorMap ? null : await prisma.unassignedLock.findUnique({ where: { lockId }, select: { gatewayId: true } });
  const carryGatewayId = priorMap?.gatewayId ?? priorPool?.gatewayId ?? null;

  // Rename in TTLock first — a failure here leaves nothing half-assigned.
  try {
    await renameLock(lockId, name);
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  await prisma.lockMap.upsert({
    where: { propertyId_roomId: { propertyId, roomId } },
    create: { propertyId, roomId, roomName: roomNumber, lockId, alias: name, gatewayId: carryGatewayId },
    update: { lockId, roomName: roomNumber, alias: name, gatewayId: carryGatewayId },
  });
  await prisma.lockMap.deleteMany({ where: { lockId, NOT: { propertyId, roomId } } });
  await prisma.unassignedLock.deleteMany({ where: { lockId } });

  // Backup codes belong to the room, not the lock: revoke whatever rode along on
  // this physical lock, then mint a fresh full set for the new room. The generator
  // is resilient + throttled (TTLock rate-limits rapid writes), so judge by COUNT:
  //   0 created  → lock truly unreachable → flag offline.
  //   1..N-1     → reachable but some writes failed → keep ONLINE, log a partial.
  //   N created  → all good (also clears any stale offline flag).
  await revokeAllCodesForLock(lockId);
  const gen = await generateBackupCodesForRoom({ propertyId, roomId, lockId, roomName: roomNumber });
  let backupNote: string;
  if (gen.created === 0) {
    await prisma.lockMap.updateMany({ where: { lockId }, data: { online: false } });
    await writeAudit(user, {
      action: "backup_autogen_failed", propertyId, roomId, lockId,
      detail: buildDetail({ outcome: "warning", message: `backup codes could not be written — lock unreachable: ${gen.errors[0] ?? "unknown error"}`, extra: { errors: gen.errors } }),
    });
    backupNote = " (backup codes pending — lock unreachable)";
  } else if (gen.created < BACKUP_SLOTS) {
    await prisma.lockMap.updateMany({ where: { lockId }, data: { online: true } });
    await writeAudit(user, {
      action: "backup_autogen_partial", propertyId, roomId, lockId,
      detail: buildDetail({ outcome: "warning", message: `${gen.created}/${BACKUP_SLOTS} backup codes created; ${gen.failed} failed — open the room and rotate the missing slots`, extra: { errors: gen.errors } }),
    });
    backupNote = `, ${gen.created}/${BACKUP_SLOTS} backup codes (some need a retry)`;
  } else {
    await prisma.lockMap.updateMany({ where: { lockId }, data: { online: true } });
    backupNote = `, ${gen.created} backup codes`;
  }

  await writeAudit(user, {
    action: "mapping_changed", propertyId, roomId, lockId,
    detail: buildDetail({ message: `assigned + renamed to ${name} (room ${roomNumber} → ${roomId})${backupNote}`, extra: { to: String(lockId), name } }),
  });
  revalidateLockSurfaces(propertyId, roomId, lockId);
  return { ok: true };
}

/**
 * Remove a room→lock mapping. To make the unmap STICK, we first rename the lock
 * in TTLock to a non-conforming `<ABBR> (unassigned)` name — otherwise the next
 * discovery sync would see the still-conforming `LL-239` name and re-map it. The
 * lock then lives in the property's available pool (UnassignedLock). Every code on
 * the lock is revoked first — a pooled lock must be a clean slate (no stale staff
 * or guest PINs riding along to wherever it's installed next).
 */
export async function unmapRoom(propertyId: string, roomId: string): Promise<ActionResult> {
  const user = await requirePermission("mapping.edit", propertyId);
  const existing = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!existing) return { ok: true };

  const unassignedName = unassignedLockName(propertyId) ?? "(unassigned)";
  try {
    await renameLock(existing.lockId, unassignedName); // first: a failure aborts before we drop a good mapping
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  // Revoke every code on the lock before it goes back in the pool. Best-effort on
  // the physical lock (a code we can't reach is still marked revoked in the DB).
  const { revoked, failed } = await revokeAllCodesForLock(existing.lockId);
  await prisma.lockMap.delete({ where: { propertyId_roomId: { propertyId, roomId } } });
  await prisma.unassignedLock.upsert({
    where: { lockId: existing.lockId },
    create: { lockId: existing.lockId, name: unassignedName, battery: existing.battery, online: existing.online, lastSeen: existing.lastSeen, gatewayId: existing.gatewayId },
    update: { name: unassignedName, battery: existing.battery, online: existing.online, lastSeen: existing.lastSeen, gatewayId: existing.gatewayId },
  });
  await writeAudit(user, {
    action: "mapping_changed", propertyId, roomId, lockId: existing.lockId,
    detail: buildDetail({ outcome: failed ? "warning" : "success", message: `unmapped + renamed to "${unassignedName}" · revoked ${revoked} code(s)${failed ? ` (${failed} not reachable on the lock)` : ""}`, extra: { from: String(existing.lockId) } }),
  });
  revalidateLockSurfaces(propertyId, roomId, existing.lockId);
  return { ok: true };
}
