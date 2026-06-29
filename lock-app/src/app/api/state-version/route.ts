import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cheap DB-only signature of a property's live state, polled by <AutoRefresh>.
 * Changes whenever occupancy (RoomState), guest codes (Passcode), or lock health
 * (LockMap) change — i.e. a guest checking in, a room flipping, a code minted or
 * revoked. The client compares it across polls and only triggers a full
 * router.refresh() when it changes, so steady-state polling never hits Cloudbeds.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const propertyId = new URL(req.url).searchParams.get("propertyId") ?? "";
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  const [rs, pc, lm] = await Promise.all([
    prisma.roomState.aggregate({ where: { propertyId }, _max: { updatedAt: true } }),
    prisma.passcode.aggregate({ where: { propertyId, status: "active" }, _max: { createdAt: true }, _count: { _all: true } }),
    prisma.lockMap.aggregate({ where: { propertyId }, _max: { updatedAt: true } }),
  ]);

  const v = [
    rs._max.updatedAt?.getTime() ?? 0,
    pc._max.createdAt?.getTime() ?? 0,
    pc._count._all,
    lm._max.updatedAt?.getTime() ?? 0,
  ].join(":");

  return NextResponse.json({ v });
}
