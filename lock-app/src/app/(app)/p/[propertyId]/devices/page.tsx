import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { unassignedLockName } from "@/lib/lock-naming";
import Forbidden from "@/components/Forbidden";
import DevicesTable, { type DeviceRow } from "./DevicesTable";

export const dynamic = "force-dynamic";

export default async function DevicesPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "devices.view", propertyId)) return <Forbidden what="devices for this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const poolName = unassignedLockName(propertyId);
  const [mapped, available] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId }, orderBy: { roomId: "asc" } }),
    poolName ? prisma.unassignedLock.findMany({ where: { name: poolName }, orderBy: { lockId: "asc" } }) : Promise.resolve([]),
  ]);

  const rows: DeviceRow[] = [
    ...mapped.map((l) => ({
      lockId: String(l.lockId),
      lockName: l.alias?.trim() || `${property.abbr} ${l.lockId}`,
      roomLabel: l.roomName?.trim() || l.roomId,
      roomId: l.roomId,
      model: l.model ?? null,
      battery: l.battery,
      online: l.online,
      lastSeen: l.lastSeen ? l.lastSeen.toISOString() : null,
      status: "mapped" as const,
    })),
    ...available.map((l) => ({
      lockId: String(l.lockId),
      lockName: l.name?.trim() || `${property.abbr} ${l.lockId}`,
      roomLabel: "—",
      roomId: null,
      model: null,
      battery: l.battery,
      online: l.online,
      lastSeen: l.lastSeen ? l.lastSeen.toISOString() : null,
      status: "available" as const,
    })),
  ];

  const online = rows.filter((r) => r.online).length;
  const offline = rows.length - online;
  const unassigned = rows.filter((r) => r.status === "available").length;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1>All locks</h1>
          <p className="subtle" style={{ marginTop: 4 }}>
            {rows.length} {rows.length === 1 ? "lock" : "locks"} · {property.name}
            {unassigned > 0 ? ` · ${unassigned} unassigned` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="pill pill-ok"><span className="dot" />{online} online</span>
          {offline > 0 && <span className="pill pill-crit"><span className="dot" />{offline} offline</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No locks for this property yet.</div>
      ) : (
        <DevicesTable rows={rows} propertyId={propertyId} />
      )}
    </div>
  );
}
