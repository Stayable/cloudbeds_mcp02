"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncDiscoveredLocks, type SyncSummary } from "@/lib/lock-sync";
import { canonicalLockName } from "@/lib/lock-naming";
import { renameLock } from "@/lib/ttlock";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { loadRoomIndex, resolveFromIndex } from "@/lib/room-resolver";
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
 * Assign a queued lock to a property + room: rename the lock in TTLock to the
 * canonical `<ABBR>-<room>` (so the TTLock name stays the source of truth — no
 * need to open the TTLock app), create the mapping, and clear it from the queue.
 */
export async function assignUnassignedLock(formData: FormData): Promise<void> {
  const lockIdRaw = String(formData.get("lockId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const room = String(formData.get("room") ?? "").trim();
  if (!/^\d+$/.test(lockIdRaw)) throw new Error("Bad lockId");
  if (!propertyId) throw new Error("Property required");
  if (!room) throw new Error("Room required");

  const name = canonicalLockName(propertyId, room);
  if (!name) throw new Error("Unknown property or empty room");

  const user = await requirePermission("mapping.edit", propertyId);
  const lockId = BigInt(lockIdRaw);

  // Resolve the typed room NUMBER to the Cloudbeds roomID the check-in webhook
  // matches on. Do this BEFORE renaming/mapping so a bad room number fails loudly
  // instead of creating a mapping that silently never drives a PIN.
  const index = await loadRoomIndex(CloudbedsRegistry.fromEnv(), propertyId);
  if (!index) {
    throw new Error(
      `No Cloudbeds key configured for property ${propertyId} — add CLOUDBEDS_API_KEY_${propertyId} to the lock-app so room numbers can be resolved.`,
    );
  }
  const roomId = resolveFromIndex(index, room);
  if (!roomId) {
    throw new Error(
      `Room "${room}" was not found in Cloudbeds for this property (or the number is ambiguous). Check the room number.`,
    );
  }

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
