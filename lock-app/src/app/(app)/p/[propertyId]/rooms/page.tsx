import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { toRoomTile, filterRoomTiles, type Occupancy, type HealthFilter } from "@/lib/rooms";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = { red: "#c0392b", amber: "#b9770e", green: "#2e7d32" };

export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: { propertyId: string };
  searchParams: { search?: string; occupancy?: string; health?: string };
}) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="rooms for this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const [locks, states, passcodes] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId } }),
    prisma.roomState.findMany({ where: { propertyId } }),
    prisma.passcode.findMany({ where: { propertyId, status: "active", type: "guest" } }),
  ]);
  const stateByRoom = new Map(states.map((s) => [s.roomId, s]));
  const pinByRoom = new Map(passcodes.map((p) => [p.roomId, p.pin]));

  const tiles = filterRoomTiles(
    locks.map((l) => {
      const s = stateByRoom.get(l.roomId);
      return toRoomTile({
        roomId: l.roomId, alias: l.alias, online: l.online, battery: l.battery,
        occupancyStatus: (s?.occupancyStatus as Occupancy) ?? "free",
        guestName: s?.guestName, checkoutDate: s?.checkoutDate, activePin: pinByRoom.get(l.roomId) ?? null,
      });
    }),
    { search: searchParams.search, occupancy: searchParams.occupancy as Occupancy | "all", health: searchParams.health as HealthFilter },
  );

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>{property.name} — Rooms</h1>
      <form method="get" style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input name="search" placeholder="Search room #" defaultValue={searchParams.search ?? ""} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <select name="occupancy" defaultValue={searchParams.occupancy ?? "all"} style={{ padding: 8 }}>
          <option value="all">All occupancy</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="free">Free</option>
        </select>
        <select name="health" defaultValue={searchParams.health ?? "all"} style={{ padding: 8 }}>
          <option value="all">All health</option><option value="online">Online</option><option value="offline">Offline</option><option value="low_battery">Low battery</option>
        </select>
        <button type="submit" style={{ padding: "8px 16px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}>Filter</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <a key={t.roomId} href={`/p/${propertyId}/rooms/${t.roomId}`} style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
            <div style={{ height: 6, background: COLOR[t.occupancyColor] }} />
            <div style={{ padding: 12, color: "#041E42" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{t.label}</strong>
                <span style={{ color: t.online ? "#2e7d32" : "#c0392b" }}>{t.online ? "online" : "offline"}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: t.batteryLow ? "#c0392b" : "#456" }}>
                {t.battery == null ? "battery —" : `battery ${t.battery}%`}{t.batteryLow ? " ⚠" : ""}
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>code {t.maskedCode ?? "—"}</div>
              {t.guestName && <div style={{ fontSize: 12, marginTop: 6, color: "#456" }}>{t.guestName} · out {t.checkoutDate}</div>}
            </div>
          </a>
        ))}
      </div>
      {tiles.length === 0 && <p style={{ marginTop: 16 }}>No rooms match.</p>}
    </div>
  );
}
