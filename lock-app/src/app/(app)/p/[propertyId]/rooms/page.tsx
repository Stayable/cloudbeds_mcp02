import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { toRoomTile, filterRoomTiles, type Occupancy, type HealthFilter } from "@/lib/rooms";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const COLS = ".7fr 1.3fr .9fr .9fr .8fr 1fr";

export default async function RoomsPage({
  params, searchParams,
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
      <div style={{ marginBottom: 16 }}>
        <h1>Rooms</h1>
        <p className="subtle" style={{ marginTop: 4 }}>{property.name} · tap a room to manage codes</p>
      </div>

      <form method="get" style={{ display: "flex", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}>
        <input name="search" placeholder="Search room #" defaultValue={searchParams.search ?? ""} className="field" style={{ height: 38 }} />
        <select name="occupancy" defaultValue={searchParams.occupancy ?? "all"} className="field" style={{ height: 38 }}>
          <option value="all">All occupancy</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="free">Free</option>
        </select>
        <select name="health" defaultValue={searchParams.health ?? "all"} className="field" style={{ height: 38 }}>
          <option value="all">All health</option><option value="online">Online</option><option value="offline">Offline</option><option value="low_battery">Low battery</option>
        </select>
        <button type="submit" className="btn btn-navy" style={{ height: 38 }}>Filter</button>
      </form>

      <div style={{ overflowX: "auto" }}>
        <div className="table-wrap" style={{ minWidth: 720 }}>
          <div className="thead" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}>
            <span>ROOM</span><span>GUEST</span><span>STATUS</span><span>CHECKOUT</span><span>LOCK</span><span style={{ textAlign: "right" }}>CODE · BATT</span>
          </div>
          {tiles.map((t) => (
            <Link key={t.roomId} href={`/p/${propertyId}/rooms/${t.roomId}`} className="trow clickable" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}>
              <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{t.label}</span>
              <span style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.guestName ?? "—"}</span>
              <span><span className={`pill ${t.guestName ? "pill-warn" : "pill-muted"}`} style={{ padding: "3px 8px" }}>{t.guestName ? "Occupied" : "Vacant"}</span></span>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{t.checkoutDate ?? "—"}</span>
              <span><span className={`pill ${t.online ? "pill-ok" : "pill-crit"}`} style={{ padding: "3px 8px" }}><span className="dot" />{t.online ? "online" : "offline"}</span></span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{t.maskedCode ?? "—"}</span>
                <span className="mono tnum" style={{ fontWeight: 600, minWidth: 38, textAlign: "right", color: t.batteryLow ? "var(--crit-ink)" : "var(--ink)" }}>{t.battery == null ? "—" : `${t.battery}%`}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
      {tiles.length === 0 && <p className="empty">No rooms match.</p>}
    </div>
  );
}
