import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { buildDashboard, type Occupancy } from "@/lib/dashboard";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [locks, states, guestPins, doorEvents] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId }, select: { roomId: true, online: true, battery: true } }),
    prisma.roomState.findMany({ where: { propertyId }, select: { roomId: true, occupancyStatus: true } }),
    prisma.passcode.findMany({ where: { propertyId, status: "active", type: "guest" }, select: { roomId: true } }),
    prisma.eventLog.findMany({ where: { propertyId, action: "door_left_open", createdAt: { gt: since } }, select: { roomId: true } }),
  ]);

  const { kpis, actions } = buildDashboard({
    locks: locks.map((l) => ({ roomId: l.roomId, online: l.online, battery: l.battery })),
    states: states.map((s) => ({ roomId: s.roomId, occupancyStatus: s.occupancyStatus as Occupancy })),
    activeGuestRoomIds: guestPins.map((p) => p.roomId),
    doorOpenRoomIds: doorEvents.map((e) => e.roomId).filter((r): r is string => !!r),
  });

  const rooms = kpis.occupied + kpis.vacant;
  const occPct = rooms ? Math.round((kpis.occupied / rooms) * 100) : 0;
  const critical = kpis.offline > 0;

  return (
    <div>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="card-title">Needs attention</span>
          <Link href={`/p/${propertyId}/alerts`} style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)" }}>View all</Link>
        </div>
        {actions.length === 0 ? (
          <p className="subtle" style={{ color: "var(--ok-ink)" }}>All clear — nothing needs attention.</p>
        ) : (
          actions.map((a, i) => (
            <Link key={`${a.kind}-${a.roomId}-${i}`} href={`/p/${propertyId}/rooms/${a.roomId}`}
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, flex: "0 0 auto", background: a.severity === "critical" ? "var(--crit)" : "var(--warn)" }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.label}</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth={1.8} strokeLinecap="round"><path d="M5 3l5 5-5 5" /></svg>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
