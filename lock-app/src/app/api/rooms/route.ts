import { CloudbedsRegistry, listRooms } from "@/lib/cloudbeds";
import { buildRoomIndex } from "@/lib/room-resolver";
import { requirePermission, AuthError } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Room options for the assign/rename dropdowns. Given a Cloudbeds propertyID,
 * returns that property's real rooms (roomID + human room number) so the UI can
 * let an operator PICK a room instead of typing a number that might not exist.
 * `hasKey:false` means no Cloudbeds key is configured for the property in the
 * lock-app — the dropdown is then disabled with a notice (we never invent rooms).
 */
export async function GET(req: Request): Promise<Response> {
  const propertyId = new URL(req.url).searchParams.get("propertyId")?.trim() ?? "";
  if (!propertyId) return Response.json({ ok: false, error: "propertyId required" }, { status: 400 });

  try {
    await requirePermission("lock.discover", propertyId);
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ ok: false, error: e.message }, { status: e.code });
    throw e;
  }

  const registry = CloudbedsRegistry.fromEnv();
  if (!registry.has(propertyId)) {
    return Response.json({ ok: true, hasKey: false, rooms: [] });
  }

  let rooms;
  try {
    rooms = await listRooms(registry, propertyId);
  } catch (e: any) {
    return Response.json({ ok: false, hasKey: true, error: e?.message ?? "Cloudbeds error" }, { status: 502 });
  }
  if (rooms === null) return Response.json({ ok: true, hasKey: false, rooms: [] });

  // Flag duplicate room numbers so the UI can disambiguate (rare, but real).
  const index = buildRoomIndex(rooms);
  const options = rooms
    .filter((r) => r.roomID && r.roomName)
    .map((r) => ({ roomId: r.roomID, roomName: r.roomName, ambiguous: index.ambiguous.has(r.roomName) }))
    .sort((a, b) => {
      const na = Number(a.roomName), nb = Number(b.roomName);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.roomName.localeCompare(b.roomName);
    });

  return Response.json({ ok: true, hasKey: true, rooms: options });
}
