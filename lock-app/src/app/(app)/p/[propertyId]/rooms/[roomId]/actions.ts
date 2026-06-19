"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createPasscode, deletePasscode } from "@/lib/ttlock";
import { generatePin, manualValidityWindow, PERIOD_PWD_TYPE } from "@/lib/passcodes";
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
