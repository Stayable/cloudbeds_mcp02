import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CloudbedsRegistry, getReservation, extractRoomIds } from "@/lib/cloudbeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only debug probe: shows EXACTLY what Cloudbeds' getReservation returns for a
 * reservation right now — its status and the room(s) we extract — so we can tell
 * "Cloudbeds hasn't propagated the room move to its API yet" apart from a bug in
 * our reconcile. Session-gated. Open in a browser while logged in:
 *   /api/debug/reservation?propertyId=210972&reservationId=3868022578221
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") ?? "";
  const reservationId = url.searchParams.get("reservationId") ?? "";
  if (!propertyId || !reservationId) {
    return NextResponse.json({ error: "propertyId and reservationId required" }, { status: 400 });
  }

  const registry = CloudbedsRegistry.fromEnv();
  if (!registry.has(propertyId)) {
    return NextResponse.json({ error: `No Cloudbeds key for property ${propertyId}` }, { status: 400 });
  }

  try {
    const d = await getReservation(registry, propertyId, reservationId);
    return NextResponse.json({
      ok: true,
      reservationId,
      status: d?.status ?? null,
      balance: (d as { balance?: unknown })?.balance ?? null,
      extractedRooms: d ? extractRoomIds(d) : [],
      // raw shapes so we can see WHERE Cloudbeds put the room assignment
      assigned: (d as { assigned?: unknown })?.assigned ?? null,
      rooms: (d as { rooms?: unknown })?.rooms ?? null,
      guestList: (d as { guestList?: unknown })?.guestList ?? null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
