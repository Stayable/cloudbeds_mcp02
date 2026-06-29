"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createPasscode, deletePasscode, listPasscodes } from "@/lib/ttlock";
import { generatePin, manualValidityWindow, PERIOD_PWD_TYPE, BACKUP_PWD_TYPE } from "@/lib/passcodes";
import { BACKUP_SLOTS } from "@/lib/door-detail";
import { detectDrift } from "@/lib/reconcile";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";

function detailPath(propertyId: string, roomId: string): string {
  return `/p/${propertyId}/rooms/${roomId}`;
}

/** Reveal the active guest PIN (logged, amber). Returns the raw value to the caller. */
export async function revealGuestCode(propertyId: string, roomId: string): Promise<{ pin: string }> {
  const user = await requirePermission("guest_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error("No active guest code for this room");
  await writeAudit(user, {
    action: "code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning", reservationId: code.reservationId ?? undefined }),
  });
  return { pin: code.pin };
}

/** Revoke the active guest PIN: delete on the lock, mark revoked, log. */
export async function revokeGuestCode(propertyId: string, roomId: string): Promise<void> {
  const user = await requirePermission("guest_code.revoke", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error("No active guest code to revoke");
  await deletePasscode({ lockId: code.lockId, keyboardPwdId: code.keyboardPwdId });
  await prisma.passcode.update({ where: { id: code.id }, data: { status: "revoked" } });
  await writeAudit(user, {
    action: "guest_code_revoked", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ reservationId: code.reservationId ?? undefined }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

/** Generate a manual (no-reservation) period code valid for `hours` from now. */
export async function generateManualCode(formData: FormData): Promise<void> {
  const propertyIdRaw = formData.get("propertyId");
  const roomIdRaw = formData.get("roomId");
  if (!propertyIdRaw || !roomIdRaw) throw new Error("Missing propertyId or roomId");
  const propertyId = String(propertyIdRaw);
  const roomId = String(roomIdRaw);
  const hours = Number(formData.get("hours") ?? 24);
  const user = await requirePermission("guest_code.generate_manual", propertyId);

  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const pin = generatePin();
  const { startTs, endTs } = manualValidityWindow(Date.now(), hours);
  const { keyboardPwdId } = await createPasscode({
    lockId: map.lockId, passcode: pin, keyboardPwdType: PERIOD_PWD_TYPE,
    startDate: startTs, endDate: endTs, name: "Manual",
  });
  await prisma.passcode.create({
    data: {
      reservationId: null, propertyId, roomId, lockId: map.lockId,
      keyboardPwdId: BigInt(keyboardPwdId), pin,
      startTs: BigInt(startTs), endTs: BigInt(endTs), status: "active", type: "manual",
    },
  });
  await writeAudit(user, {
    action: "manual_code_created", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ extra: { hours, keyboardPwdId: String(keyboardPwdId) } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > BACKUP_SLOTS) {
    throw new Error(`Invalid backup slot ${slot}`);
  }
}

/**
 * Prisma `where` fragment selecting one backup slot. Slot 1 also matches legacy
 * backup rows written before slots existed (backupSlot null) so they aren't
 * orphaned by the migration.
 */
function backupSlotWhere(slot: number): { backupSlot: number } | { OR: { backupSlot: number | null }[] } {
  return slot === 1 ? { OR: [{ backupSlot: 1 }, { backupSlot: null }] } : { backupSlot: slot };
}

/** Reveal a per-lock staff backup code in a given slot (logged, amber). */
export async function revealBackupCode(propertyId: string, roomId: string, slot: number): Promise<{ pin: string }> {
  assertSlot(slot);
  const user = await requirePermission("backup_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active", ...backupSlotWhere(slot) },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error(`No backup code in slot ${slot} — rotate to create one`);
  await writeAudit(user, {
    action: "backup_code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning", extra: { slot } }),
  });
  return { pin: code.pin };
}

/**
 * Rotate one staff backup slot: provision a NEW permanent code in that slot, then
 * delete the old one (new-first so a failure never leaves the slot empty), and log
 * the masked before→after. Each of the BACKUP_SLOTS slots rotates independently.
 */
export async function rotateBackupCode(propertyId: string, roomId: string, slot: number): Promise<void> {
  assertSlot(slot);
  const user = await requirePermission("backup_code.rotate", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const old = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active", ...backupSlotWhere(slot) },
    orderBy: { createdAt: "desc" },
  });

  const pin = generatePin();
  const { keyboardPwdId } = await createPasscode({
    lockId: map.lockId, passcode: pin, keyboardPwdType: BACKUP_PWD_TYPE, name: `Backup ${slot}`,
  });
  await prisma.passcode.create({
    data: {
      reservationId: null, propertyId, roomId, lockId: map.lockId,
      keyboardPwdId: BigInt(keyboardPwdId), pin,
      startTs: BigInt(0), endTs: BigInt(0), status: "active", type: "backup", backupSlot: slot,
    },
  });
  if (old) {
    await deletePasscode({ lockId: old.lockId, keyboardPwdId: old.keyboardPwdId });
    await prisma.passcode.update({ where: { id: old.id }, data: { status: "revoked" } });
  }
  await writeAudit(user, {
    action: "backup_code_rotated", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ beforePin: old?.pin, afterPin: pin, extra: { slot } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

/**
 * Reconcile our DB against the lock (spec §10). Lists the lock's real passcodes,
 * diffs against our active rows, logs a warning on drift (potential lockout).
 */
export async function syncFromLock(
  propertyId: string, roomId: string,
): Promise<{ inSync: boolean; missingOnLock: string[]; orphanOnLock: string[] }> {
  const user = await requirePermission("lock.sync", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const [{ list }, active] = await Promise.all([
    listPasscodes(map.lockId),
    prisma.passcode.findMany({ where: { propertyId, roomId, status: "active" } }),
  ]);
  const drift = detectDrift(
    active.map((p) => String(p.keyboardPwdId)),
    list.map((p) => String(p.keyboardPwdId)),
  );
  await writeAudit(user, {
    action: "sync_from_lock", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({
      outcome: drift.inSync ? "success" : "warning",
      message: drift.inSync ? "in sync" : "drift detected",
      extra: { missingOnLock: drift.missingOnLock, orphanOnLock: drift.orphanOnLock },
    }),
  });
  revalidatePath(detailPath(propertyId, roomId));
  return drift;
}

