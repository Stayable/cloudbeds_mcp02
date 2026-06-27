"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncDiscoveredLocks, type SyncSummary } from "@/lib/lock-sync";
import { canonicalLockName } from "@/lib/lock-naming";
import { renameLock } from "@/lib/ttlock";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { loadRoomIndex, resolveNameFromId } from "@/lib/room-resolver";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";

export interface SyncState {
  ran: boolean;
  summary?: SyncSummary;
  error?: string;
}

/** Run the TTLock discovery sync (auto-map conforming names, queue the rest). */
export async function runLockSync(_prev: SyncState, _formData: FormData): Promise<SyncState> {
  const user = await requirePermission("lock.discover");
  try {
    const summary = await syncDiscoveredLocks();
    await writeAudit(user, {
      action: "lock_discovery_sync",
      propertyId: "all",
      detail: buildDetail({
        outcome: summary.errors.length ? "warning" : "success",
        message: `mapped ${summary.mapped}, queued ${summary.queued}, kept ${summary.kept}, unresolved ${summary.unresolved} of ${summary.total}`,
        extra: { errors: summary.errors },
      }),
    });
    revalidatePath("/unassigned");
    return { ran: true, summary };
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

  // Rename in TTLock first — if this fails (e.g. gateway/lock unreachable) we
  // surface the error and leave the queue untouched rather than mapping a lock
  // whose real name doesn't match.
  await renameLock(lockId, name);

  await prisma.lockMap.upsert({
    where: { propertyId_roomId: { propertyId, roomId } },
    create: { propertyId, roomId, roomName: room, lockId, alias: name },
    update: { lockId, roomName: room, alias: name },
  });
  // One mapping per lock: drop any other rows for this lockId, clear the queue.
  await prisma.lockMap.deleteMany({ where: { lockId, NOT: { propertyId, roomId } } });
  await prisma.unassignedLock.deleteMany({ where: { lockId } });

  await writeAudit(user, {
    action: "unassigned_lock_assigned",
    propertyId,
    roomId,
    lockId,
    detail: buildDetail({ message: `assigned + renamed to ${name} (room ${room} → ${roomId})`, extra: { lockId: lockIdRaw, name, room, roomId } }),
  });
  revalidatePath("/unassigned");
}
