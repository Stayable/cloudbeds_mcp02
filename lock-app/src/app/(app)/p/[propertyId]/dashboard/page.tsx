import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { buildDashboard, type Occupancy } from "@/lib/dashboard";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const SEV_COLOR = { critical: "#c0392b", warning: "#b9770e" } as const;

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

  const KPIS: [string, number, string][] = [
    ["Locks", kpis.totalLocks, "#041E42"], ["Online", kpis.online, "#2e7d32"],
    ["Offline", kpis.offline, kpis.offline ? "#c0392b" : "#2e7d32"],
    ["Low battery", kpis.lowBattery, kpis.lowBattery ? "#b9770e" : "#2e7d32"],
    ["Occupied", kpis.occupied, "#041E42"], ["Vacant", kpis.vacant, "#041E42"],
  ];

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>{property.name} — Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, margin: "16px 0" }}>
        {KPIS.map(([label, value, color]) => (
          <div key={label} style={{ border: "1px solid #d7dde6", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 13, color: "#456" }}>{label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ color: "#041E42", fontSize: 18 }}>My Actions</h2>
      {actions.length === 0 ? (
        <p style={{ color: "#2e7d32" }}>All clear — nothing needs attention.</p>
      ) : (
        <div style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden" }}>
          {actions.map((a, i) => (
            <a key={`${a.kind}-${a.roomId}-${i}`} href={`/p/${propertyId}/rooms/${a.roomId}`}
               style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderTop: i ? "1px solid #eef" : "none", textDecoration: "none", color: "#041E42" }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: SEV_COLOR[a.severity] }} />
              <span>{a.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
