"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncDiscoveredLocks, type SyncSummary } from "@/lib/lock-sync";
import { syncGateways, type GatewaySyncSummary } from "@/lib/gateway-sync";
import { canonicalLockName } from "@/lib/lock-naming";
import { renameLock } from "@/lib/ttlock";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { loadRoomIndex, resolveNameFromId } from "@/lib/room-resolver";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";
import { revokeAllCodesForLock, generateBackupCodesForRoom } from "@/lib/backup-codes";
import { BACKUP_SLOTS } from "@/lib/door-detail";

export interface SyncState {
  ran: boolean;
  summary?: SyncSummary;
  gateways?: GatewaySyncSummary;
  error?: string;
}

/**
 * Run the TTLock discovery sync (auto-map conforming names, queue the rest), then
 * the gateway sync (link locks→gateways + infer each gateway's property). Gateways
 * run second so they see the freshly-written LockMap rows. A gateway-sync failure
 * is non-fatal — the lock results still return.
 */
export async function runLockSync(_prev: SyncState, _formData: FormData): Promise<SyncState> {
  const user = await requirePermission("lock.discover");
  try {
    const summary = await syncDiscoveredLocks();

    let gateways: GatewaySyncSummary | undefined;
    try {
      gateways = await syncGateways();
    } catch (ge: any) {
      gateways = { total: 0, updated: 0, removed: 0, lockLinks: 0, errors: [{ gatewayId: "all", error: ge?.message ?? String(ge) }] };
    }

    await writeAudit(user, {
      action: "lock_discovery_sync",
      propertyId: "all",
      detail: buildDetail({
        outcome: summary.errors.length || gateways.errors.length ? "warning" : "success",
        message: `mapped ${summary.mapped}, queued ${summary.queued}, kept ${summary.kept}, unresolved ${summary.unresolved} of ${summary.total} · gateways ${gateways.updated} (${gateways.lockLinks} links)`,
        extra: { errors: summary.errors, gatewayErrors: gateways.errors },
      }),
    });
    revalidatePath("/unassigned");
    return { ran: true, summary, gateways };
  } catch (e: any) {
    return { ran: true, error: e?.message ?? String(e) };
  }
}

/**
 * Assign a queued lock to a property + room. The room arrives as a Cloudbeds
 * `roomId` chosen from a dropdown of the property's REAL rooms — so the room
 * always exists and the roomID (which the check-in webhook matches on) is exact.
 * We re-derive the human room number from Cloudbeds server-side (never trusting
 * the client's label or a forged id), rename the lock in TTLock to the canonical
 * `<ABBR>-<room>` (so the TTLock name stays the source of truth — no need to open
 * the TTLock app), create the mapping, and clear it from the queue.
 */
export async function assignUnassignedLock(formData: FormData): Promise<void> {
  const lockIdRaw = String(formData.get("lockId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "").trim();
  if (!/^\d+$/.test(lockIdRaw)) throw new Error("Bad lockId");
  if (!propertyId) throw new Error("Property required");
  if (!roomId) throw new Error("Room required");

  const user = await requirePermission("mapping.edit", propertyId);
  const lockId = BigInt(lockIdRaw);

  // Confirm the chosen roomId is a real room for this property and get its
  // authoritative room NUMBER (the lock-name token). Do this BEFORE renaming/
  // mapping so a stale/forged id fails loudly instead of creating a dead mapping.
  const index = await loadRoomIndex(CloudbedsRegistry.fromEnv(), propertyId);
  if (!index) {
    throw new Error(
      `No Cloudbeds key configured for property ${propertyId} — add CLOUDBEDS_API_KEY_${propertyId} to the lock-app so rooms can be listed.`,
    );
  }
  const room = resolveNameFromId(index, roomId);
  if (!room) {
    throw new Error(`Room ${roomId} is not a current Cloudbeds room for this property. Re-pick the room.`);
  }

  const name = canonicalLockName(propertyId, room);
  if (!name) throw new Error("Unknown property or empty room");

  // The gateway↔lock binding is physical — carry the lock's existing gatewayId
  // onto the new mapping so the room doesn't read "not connected" until a Sync.
  const priorMap = await prisma.lockMap.findFirst({ where: { lockId }, select: { gatewayId: true } });
  const priorPool = priorMap ? null : await prisma.unassignedLock.findUnique({ where: { lockId }, select: { gatewayId: true } });
  const carryGatewayId = priorMap?.gatewayId ?? priorPool?.gatewayId ?? null;

  // Rename in TTLock first — if this fails (e.g. gateway/lock unreachable) we
  // surface the error and leave the queue untouched rather than mapping a lock
  // whose real name doesn't match.
  await renameLock(lockId, name);

  await prisma.lockMap.upsert({
    where: { propertyId_roomId: { propertyId, roomId } },
    create: { propertyId, roomId, roomName: room, lockId, alias: name, gatewayId: carryGatewayId },
    update: { lockId, roomName: room, alias: name, gatewayId: carryGatewayId },
  });
  // One mapping per lock: drop any other rows for this lockId, clear the queue.
  await prisma.lockMap.deleteMany({ where: { lockId, NOT: { propertyId, roomId } } });
  await prisma.unassignedLock.deleteMany({ where: { lockId } });

  // Same backup-code lifecycle as the lock/room-detail assign: revoke whatever
  // rode along on this physical lock, then mint a fresh set for the new room. The
  // generator is resilient + throttled; judge by COUNT (0 = offline, partial =
  // keep online + log, full = clears any stale offline flag).
  await revokeAllCodesForLock(lockId);
  const gen = await generateBackupCodesForRoom({ propertyId, roomId, lockId });
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
    action: "unassigned_lock_assigned",
    propertyId,
    roomId,
    lockId,
    detail: buildDetail({ message: `assigned + renamed to ${name} (room ${room} → ${roomId})${backupNote}`, extra: { lockId: lockIdRaw, name, room, roomId } }),
  });
  revalidatePath("/unassigned");
}
