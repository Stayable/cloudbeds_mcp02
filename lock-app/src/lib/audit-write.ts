import { prisma } from "./db";

/** Write one audit row attributing a UI action to the acting user. */
export async function writeAudit(
  actor: { id: string; email: string; roleName: string },
  entry: {
    action: string;
    propertyId: string;
    roomId?: string;
    lockId?: bigint | null;
    event?: string;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.eventLog.create({
    data: {
      source: "admin",
      event: entry.event ?? entry.action,
      propertyId: entry.propertyId,
      roomId: entry.roomId ?? null,
      lockId: entry.lockId ?? null,
      action: entry.action,
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.roleName,
      detail: entry.detail as object,
    },
  });
}
