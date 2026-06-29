import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { buildDashboard, type Occupancy } from "@/lib/dashboard";
import { buildRoomChips, type RoomChipInput } from "@/lib/rooms";
import { CloudbedsRegistry, listRooms } from "@/lib/cloudbeds";
import RoomHeatmap, { RoomHeatmapLegend } from "@/components/RoomHeatmap";
import OccupancySyncButton from "@/components/OccupancySyncButton";
import RoomChangeSyncButton from "@/components/RoomChangeSyncButton";
import AutoRefresh from "@/components/AutoRefresh";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const registry = CloudbedsRegistry.fromEnv();
  const [locks, states, guestPins, doorEvents, cbRooms] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId }, select: { roomId: true, roomName: true, online: true, battery: true } }),
    prisma.roomState.findMany({ where: { propertyId }, select: { roomId: true, occupancyStatus: true } }),
    prisma.passcode.findMany({ where: { propertyId, status: "active", type: "guest" }, select: { roomId: true } }),
    prisma.eventLog.findMany({ where: { propertyId, action: "door_left_open", createdAt: { gt: since } }, select: { roomId: true } }),
    listRooms(registry, propertyId).catch(() => null),
  ]);

  // Cloudbeds roomID → human room number, for friendly action labels. Names come
  // from the Cloudbeds inventory (covers unmapped rooms too) with mapped LockMap
  // roomNames layered on top, so a "no guest code" alert reads "room 305", not
  // the raw roomID "405763-1".
  const roomNameById: Record<string, string> = {};
  for (const r of cbRooms ?? []) if (r.roomName) roomNameById[r.roomID] = r.roomName;
  for (const l of locks) if (l.roomName) roomNameById[l.roomId] = l.roomName;

  // Full-inventory room heatmap (same chips as the Portfolio squares, but labeled
  // + clickable). Mapped locks unioned with Cloudbeds rooms; degrades to mapped
  // -only if no CB key / the call fails.
  const occByRoom = new Map(states.map((s) => [s.roomId, s.occupancyStatus as Occupancy]));
  const mappedIds = new Set(locks.map((l) => l.roomId));
  const chipInputs: RoomChipInput[] = [
    ...locks.map((l) => ({
      roomId: l.roomId, roomName: l.roomName, mapped: true, online: l.online, battery: l.battery,
      occupancyStatus: occByRoom.get(l.roomId),
    })),
    ...(cbRooms ?? []).filter((r) => !mappedIds.has(r.roomID)).map((r) => ({
      roomId: r.roomID, roomName: r.roomName, mapped: false, online: false, battery: null,
      occupancyStatus: occByRoom.get(r.roomID),
    })),
  ];
  const roomChips = buildRoomChips(chipInputs);

  const { kpis, actions } = buildDashboard({
    locks: locks.map((l) => ({ roomId: l.roomId, online: l.online, battery: l.battery })),
    states: states.map((s) => ({ roomId: s.roomId, occupancyStatus: s.occupancyStatus as Occupancy })),
    activeGuestRoomIds: guestPins.map((p) => p.roomId),
    doorOpenRoomIds: doorEvents.map((e) => e.roomId).filter((r): r is string => !!r),
    roomNameById,
  });

  const rooms = kpis.occupied + kpis.vacant;
  const occPct = rooms ? Math.round((kpis.occupied / rooms) * 100) : 0;
  const critical = kpis.offline > 0;

  return (
    <div>
      <AutoRefresh propertyId={propertyId} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div className="abbr-badge" style={{ width: 44, height: 44, fontSize: 14 }}>{property.abbr}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{property.name}</h1>
          <p className="subtle" style={{ marginTop: 3 }}>{property.streetCode} · {rooms} {rooms === 1 ? "room" : "rooms"}</p>
        </div>
        <span className={`pill ${critical ? "pill-crit" : "pill-ok"}`}>
          <span className="dot" />{critical ? `Critical — ${kpis.offline} offline` : "All clear"}
        </span>
      </div>

      <div className="kpi-grid">
        <div className="card"><div className="kpi-label">OCCUPANCY</div><div className="kpi-value tnum">{occPct}%</div><div className="kpi-sub">{kpis.occupied} of {rooms} rooms</div></div>
        <div className="card"><div className="kpi-label">LOCKS ONLINE</div><div className="kpi-value tnum" style={{ color: "var(--ok-ink)" }}>{kpis.online}<span style={{ fontSize: 14, fontWeight: 500, color: "var(--faint)" }}>/{kpis.totalLocks}</span></div><div className="kpi-sub">{kpis.totalLocks ? Math.round((kpis.online / kpis.totalLocks) * 100) : 0}% uptime</div></div>
        <div className="card accent-crit"><div className="kpi-label">OFFLINE</div><div className="kpi-value tnum" style={{ color: kpis.offline ? "var(--crit-ink)" : "var(--ink)" }}>{kpis.offline}</div><div className="kpi-sub">{kpis.offline ? "needs attention" : "all online"}</div></div>
        <div className="card accent-warn"><div className="kpi-label">LOW BATTERY</div><div className="kpi-value tnum" style={{ color: kpis.lowBattery ? "var(--warn-ink)" : "var(--ink)" }}>{kpis.lowBattery}</div><div className="kpi-sub">{kpis.lowBattery ? "replace soon" : "all healthy"}</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <span className="card-title">All rooms{roomChips.length ? ` · ${roomChips.length}` : ""}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {sessionCan(user, "lock.sync", propertyId) && <OccupancySyncButton propertyId={propertyId} />}
            {sessionCan(user, "lock.sync", propertyId) && <RoomChangeSyncButton propertyId={propertyId} />}
            <Link href={`/p/${propertyId}/rooms`} style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)" }}>List view</Link>
          </div>
        </div>
        {roomChips.length === 0 ? (
          <p className="subtle">No rooms found — check the Cloudbeds key for this property.</p>
        ) : (
          <>
            <RoomHeatmap chips={roomChips} variant="numbered" propertyId={propertyId} from="dashboard" />
            <div style={{ marginTop: 12 }}><RoomHeatmapLegend /></div>
          </>
        )}
      </div>

      <details className="card accordion" open style={{ marginTop: 16 }}>
        <summary className="accordion-summary">
          <span className="card-title">Needs attention</span>
          <span className={`chip ${actions.length === 0 ? "chip-ok" : critical ? "chip-crit" : "chip-warn"}`}>{actions.length}</span>
          <svg className="accordion-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 6l4 4 4-4" /></svg>
        </summary>
        <div className="accordion-body">
          {actions.length === 0 ? (
            <p className="subtle" style={{ color: "var(--ok-ink)" }}>All clear — nothing needs attention.</p>
          ) : (
            actions.map((a, i) => (
              <Link key={`${a.kind}-${a.roomId}-${i}`} href={`/p/${propertyId}/rooms/${a.roomId}?from=dashboard`}
                style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, flex: "0 0 auto", background: a.severity === "critical" ? "var(--crit)" : "var(--warn)" }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.label}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth={1.8} strokeLinecap="round"><path d="M5 3l5 5-5 5" /></svg>
              </Link>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
