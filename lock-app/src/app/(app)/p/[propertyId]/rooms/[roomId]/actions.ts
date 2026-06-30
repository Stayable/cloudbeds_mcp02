"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createPasscode, deletePasscode, listPasscodes } from "@/lib/ttlock";
import { generatePin, manualValidityWindow, guestValidityWindow, PERIOD_PWD_TYPE, BACKUP_PWD_TYPE } from "@/lib/passcodes";
import { BACKUP_SLOTS } from "@/lib/door-detail";
import { CloudbedsRegistry, getReservation, postReservationNote } from "@/lib/cloudbeds";
import { detectDrift } from "@/lib/reconcile";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";
import { mapActionError, type ActionResult } from "@/lib/action-result";
import { notifyGuestCode } from "@/lib/guest-notify";

function detailPath(propertyId: string, roomId: string): string {
  return `/p/${propertyId}/rooms/${roomId}`;
}

/** Reveal the active guest PIN (logged, amber). Returns the raw value to the caller. */
export async function revealGuestCode(propertyId: string, roomId: string): Promise<ActionResult<{ pin: string }>> {
  const user = await requirePermission("guest_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) return { ok: false, error: "There’s no active guest code for this room." };
  await writeAudit(user, {
    action: "code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning", reservationId: code.reservationId ?? undefined }),
  });
  return { ok: true, data: { pin: code.pin } };
}

/** Revoke the active guest PIN: delete on the lock, mark revoked, log. */
export async function revokeGuestCode(propertyId: string, roomId: string): Promise<ActionResult> {
  const user = await requirePermission("guest_code.revoke", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) return { ok: false, error: "There’s no active guest code to revoke." };
  try {
    await deletePasscode({ lockId: code.lockId, keyboardPwdId: code.keyboardPwdId });
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  // Null activeKey so the duplicate-PIN guard frees this (reservation, room) slot.
  await prisma.passcode.update({ where: { id: code.id }, data: { status: "revoked", activeKey: null } });
  await writeAudit(user, {
    action: "guest_code_revoked", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ reservationId: code.reservationId ?? undefined }),
  });
  revalidatePath(detailPath(propertyId, roomId));
  return { ok: true };
}

/**
 * Resend the guest door code for this room's current reservation: clear any
 * existing guest code and issue a FRESH one with a valid (timezone-correct) window,
 * then re-post the `<lock>-<PIN>` note to Cloudbeds. Use when a guest didn't get the
 * code or it expired. Returns the new PIN so the desk can read it out.
 */
export async function resendGuestCode(propertyId: string, roomId: string): Promise<ActionResult<{ pin: string }>> {
  const user = await requirePermission("guest_code.generate_manual", propertyId);

  const map = await prisma.lockMap.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } });
  if (!map) return { ok: false, error: "This room isn’t mapped to a lock yet." };

  const state = await prisma.roomState.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } });
  const reservationId = state?.currentReservationId;
  if (!reservationId) return { ok: false, error: "No current reservation on this room — nothing to resend." };

  const registry = CloudbedsRegistry.fromEnv();
  let reservation;
  try {
    reservation = await getReservation(registry, propertyId, reservationId);
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  if (!reservation) return { ok: false, error: `No Cloudbeds key for property ${propertyId} — add CLOUDBEDS_API_KEY_${propertyId}.` };
  let window: { startTs: number; endTs: number };
  try {
    window = guestValidityWindow(reservation.startDate, reservation.endDate);
  } catch {
    return { ok: false, error: "This reservation has no valid stay dates in Cloudbeds." };
  }

  // Clear any existing guest code (active or in its grace window) so we don't double
  // up — delete on the lock best-effort, free the dup-guard slot.
  const old = await prisma.passcode.findMany({
    where: { propertyId, roomId, type: "guest", status: { in: ["active", "expiring"] } },
  });
  for (const pc of old) {
    await deletePasscode({ lockId: pc.lockId, keyboardPwdId: pc.keyboardPwdId }).catch(() => {});
    await prisma.passcode.update({ where: { id: pc.id }, data: { status: "revoked", activeKey: null } });
  }

  const pin = generatePin();
  let keyboardPwdId: number;
  try {
    ({ keyboardPwdId } = await createPasscode({
      lockId: map.lockId, passcode: pin, keyboardPwdType: PERIOD_PWD_TYPE,
      startDate: window.startTs, endDate: window.endTs, name: `Res ${reservationId}`,
    }));
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  try {
    await prisma.passcode.create({
      data: {
        reservationId, propertyId, roomId, lockId: map.lockId,
        keyboardPwdId: BigInt(keyboardPwdId), pin,
        startTs: BigInt(window.startTs), endTs: BigInt(window.endTs),
        status: "active", type: "guest", activeKey: `${reservationId}:${roomId}`,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // The middleware issued one concurrently — drop our spare lock code.
      await deletePasscode({ lockId: map.lockId, keyboardPwdId }).catch(() => {});
      return { ok: false, error: "A code was just issued for this room — refresh to see it." };
    }
    throw e;
  }

  const label = map.alias?.trim() || map.roomName?.trim() || roomId;
  await postReservationNote(registry, propertyId, reservationId, `${label}-${pin}`).catch(() => {});

  // Email the guest in TWO parts (best-effort — never blocks the resend): first
  // that the old code is deactivated, then the new code. Order matters for the
  // inbox, so send sequentially.
  const roomNumber = map.roomName?.trim() || roomId;
  const revokedEmail = await notifyGuestCode({ propertyId, reservationId, roomNumber, kind: "code_revoked" });
  const generatedEmail = await notifyGuestCode({ propertyId, reservationId, roomNumber, kind: "generated", doorCode: pin });

  await writeAudit(user, {
    action: "guest_code_resent", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ reservationId, extra: { keyboardPwdId: String(keyboardPwdId), revokedEmailSent: revokedEmail.sent, generatedEmailSent: generatedEmail.sent, emailReason: revokedEmail.reason ?? generatedEmail.reason } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
  return { ok: true, data: { pin } };
}

/** Generate a manual (no-reservation) period code valid for `hours` from now. */
export async function generateManualCode(formData: FormData): Promise<ActionResult> {
  const propertyIdRaw = formData.get("propertyId");
  const roomIdRaw = formData.get("roomId");
  if (!propertyIdRaw || !roomIdRaw) return { ok: false, error: "Missing room information — reload the page and try again." };
  const propertyId = String(propertyIdRaw);
  const roomId = String(roomIdRaw);
  const hours = Number(formData.get("hours") ?? 24);
  if (!(hours > 0)) return { ok: false, error: "Enter a positive number of hours." };
  const user = await requirePermission("guest_code.generate_manual", propertyId);

  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) return { ok: false, error: "This room isn’t mapped to a lock yet." };

  const pin = generatePin();
  const { startTs, endTs } = manualValidityWindow(Date.now(), hours);
  let keyboardPwdId: number;
  try {
    ({ keyboardPwdId } = await createPasscode({
      lockId: map.lockId, passcode: pin, keyboardPwdType: PERIOD_PWD_TYPE,
      startDate: startTs, endDate: endTs, name: "Manual",
    }));
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
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
  return { ok: true };
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
export async function revealBackupCode(propertyId: string, roomId: string, slot: number): Promise<ActionResult<{ pin: string }>> {
  assertSlot(slot);
  const user = await requirePermission("backup_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active", ...backupSlotWhere(slot) },
    orderBy: { createdAt: "desc" },
  });
  if (!code) return { ok: false, error: `No backup code in slot ${slot} yet — rotate it to create one.` };
  await writeAudit(user, {
    action: "backup_code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning", extra: { slot } }),
  });
  return { ok: true, data: { pin: code.pin } };
}

/**
 * Rotate one staff backup slot: provision a NEW permanent code in that slot, then
 * delete the old one (new-first so a failure never leaves the slot empty), and log
 * the masked before→after. Each of the BACKUP_SLOTS slots rotates independently.
 */
export async function rotateBackupCode(propertyId: string, roomId: string, slot: number): Promise<ActionResult> {
  assertSlot(slot);
  const user = await requirePermission("backup_code.rotate", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) return { ok: false, error: "This room isn’t mapped to a lock yet." };

  const old = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active", ...backupSlotWhere(slot) },
    orderBy: { createdAt: "desc" },
  });

  const pin = generatePin();
  let keyboardPwdId: number;
  try {
    ({ keyboardPwdId } = await createPasscode({
      lockId: map.lockId, passcode: pin, keyboardPwdType: BACKUP_PWD_TYPE, name: `Backup ${slot}`,
    }));
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
  await prisma.passcode.create({
    data: {
      reservationId: null, propertyId, roomId, lockId: map.lockId,
      keyboardPwdId: BigInt(keyboardPwdId), pin,
      startTs: BigInt(0), endTs: BigInt(0), status: "active", type: "backup", backupSlot: slot,
    },
  });
  if (old) {
    // Best-effort delete of the previous code; the new one is already live, so a
    // failure here must not surface as an error (it would imply rotation failed).
    try {
      await deletePasscode({ lockId: old.lockId, keyboardPwdId: old.keyboardPwdId });
    } catch { /* leave old row active-untracked; sync-from-lock will surface drift */ }
    await prisma.passcode.update({ where: { id: old.id }, data: { status: "revoked" } });
  }
  await writeAudit(user, {
    action: "backup_code_rotated", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ beforePin: old?.pin, afterPin: pin, extra: { slot } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
  return { ok: true };
}

/**
 * Reconcile our DB against the lock (spec §10). Lists the lock's real passcodes,
 * diffs against our active rows, logs a warning on drift (potential lockout).
 */
export async function syncFromLock(propertyId: string, roomId: string): Promise<ActionResult> {
  const user = await requirePermission("lock.sync", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) return { ok: false, error: "This room isn’t mapped to a lock yet." };

  let list: Awaited<ReturnType<typeof listPasscodes>>["list"];
  let active: Awaited<ReturnType<typeof prisma.passcode.findMany>>;
  try {
    [{ list }, active] = await Promise.all([
      listPasscodes(map.lockId),
      prisma.passcode.findMany({ where: { propertyId, roomId, status: "active" } }),
    ]);
  } catch (e) {
    return { ok: false, error: mapActionError(e) };
  }
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
  return { ok: true };
}
