import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, userProperties, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { summarizeProperty } from "@/lib/overview";
import { buildRoomChips, type Occupancy, type RoomChipInput } from "@/lib/rooms";
import { CloudbedsRegistry, listRooms } from "@/lib/cloudbeds";
import RoomHeatmap, { RoomHeatmapLegend } from "@/components/RoomHeatmap";
import OccupancySyncButton from "@/components/OccupancySyncButton";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUserOrRedirect();
  const props = userProperties(user);
  const propIds = props.map((p) => p.id);

  // Mapped locks + occupancy from the DB; full room inventory (for "no lock"
  // chips) from Cloudbeds per property, in parallel. Each CB call degrades to
  // null on missing key / failure so one property can't break the page.
  const registry = CloudbedsRegistry.fromEnv();
  const [locks, states, cbByProp] = await Promise.all([
    prisma.lockMap.findMany({
      where: { propertyId: { in: propIds } },
      select: { propertyId: true, roomId: true, roomName: true, online: true, battery: true },
    }),
    prisma.roomState.findMany({
      where: { propertyId: { in: propIds } },
      select: { propertyId: true, roomId: true, occupancyStatus: true },
    }),
    Promise.all(propIds.map(async (id) => [id, await listRooms(registry, id).catch(() => null)] as const)),
  ]);
  const cbRoomsByProp = new Map(cbByProp);

  const cards = props.map((p) => {
    const pLocks = locks.filter((l) => l.propertyId === p.id);
    const occByRoom = new Map(states.filter((s) => s.propertyId === p.id).map((s) => [s.roomId, s.occupancyStatus]));
    const mappedIds = new Set(pLocks.map((l) => l.roomId));
    const cbRooms = cbRoomsByProp.get(p.id) ?? null;

    const chipInputs: RoomChipInput[] = [
      ...pLocks.map((l) => ({
        roomId: l.roomId, roomName: l.roomName, mapped: true, online: l.online, battery: l.battery,
        occupancyStatus: occByRoom.get(l.roomId) as Occupancy | undefined,
      })),
      ...(cbRooms ?? []).filter((r) => !mappedIds.has(r.roomID)).map((r) => ({
        roomId: r.roomID, roomName: r.roomName, mapped: false, online: false, battery: null,
        occupancyStatus: occByRoom.get(r.roomID) as Occupancy | undefined,
      })),
    ];
    const chips = buildRoomChips(chipInputs);
    return {
      ...summarizeProperty(p, pLocks.map((l) => ({ online: l.online, battery: l.battery }))),
      abbr: getProperty(p.id)?.abbr ?? "—",
      chips,
      noLock: chips.filter((ch) => ch.status === "no-lock").length,
    };
  });

  const totalLocks = locks.length;
  const totOnline = locks.filter((l) => l.online).length;
  const totLowbatt = locks.filter((l) => l.battery != null && l.battery < 20).length;
  const totOffline = locks.filter((l) => !l.online).length;

  const canDiscover = sessionCan(user, "lock.discover");
  const canSync = sessionCan(user, "lock.sync");
  const unassignedCount = canDiscover ? await prisma.unassignedLock.count() : 0;

  return (
    <div>
      <div className="fleet-head">
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>Fleet heartbeat</h1>
          <p className="subtle" style={{ marginTop: 5 }}>
            {props.length} {props.length === 1 ? "property" : "properties"} · {totalLocks} locks · live status
          </p>
          <RoomHeatmapLegend />
          {canSync && <div style={{ marginTop: 10 }}><OccupancySyncButton label="Sync occupancy from Cloudbeds" /></div>}
        </div>
        <div className="fleet-stats">
          <div className="fleet-stat"><div className="n tnum" style={{ color: "var(--ok)" }}>{totOnline}</div><div className="l">online</div></div>
          <div className="fleet-div" />
          <div className="fleet-stat"><div className="n tnum" style={{ color: "var(--warn)" }}>{totLowbatt}</div><div className="l">low battery</div></div>
          <div className="fleet-div" />
          <div className="fleet-stat"><div className="n tnum" style={{ color: "var(--crit)" }}>{totOffline}</div><div className="l">offline</div></div>
        </div>
      </div>

      {canDiscover && unassignedCount > 0 && (
        <Link href="/unassigned" className="banner-unassigned">
          <div className="banner-icon">
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="#041E42" strokeWidth={1.7}><rect x="3" y="7.5" width="12" height="8" rx="1.5" /><path d="M5.5 7.5V5a3.5 3.5 0 017 0" strokeLinecap="round" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{unassignedCount} {unassignedCount === 1 ? "lock needs" : "locks need"} renaming</div>
            <div style={{ fontSize: 13, color: "#7A6320", marginTop: 2 }}>Discovered locks whose name doesn&apos;t match the ABBR-room convention.</div>
          </div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#9A5E00" }}>Review →</span>
        </Link>
      )}

      {cards.length > 0 ? (
        <div className="portfolio-grid" role="list">
          {cards.map((c) => (
            <Link key={c.propertyId} href={`/p/${c.propertyId}/dashboard`} role="listitem" className="prop-card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                <div className="abbr-badge">{c.abbr}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{getProperty(c.propertyId)?.streetCode}</div>
                </div>
                <span className={`pill ${c.needsAttention ? "pill-crit" : "pill-ok"}`}>
                  <span className="dot" />{c.needsAttention ? `${c.needsAttention} to fix` : "All clear"}
                </span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <RoomHeatmap chips={c.chips} variant="square" />
              </div>
              <div className="statgrid">
                <div className="statmini"><div className="n tnum">{c.online}<span className="den">/{c.totalLocks}</span></div><div className="l"><span className="legend-swatch rc-ok" />ONLINE</div></div>
                <div className="statmini"><div className="n tnum" style={{ color: c.offline ? "var(--crit-ink)" : "var(--ink)" }}>{c.offline}</div><div className="l"><span className="legend-swatch rc-issue" />OFFLINE</div></div>
                <div className="statmini"><div className="n tnum" style={{ color: c.lowBattery ? "var(--warn-ink)" : "var(--ink)" }}>{c.lowBattery}</div><div className="l"><span className="legend-swatch rc-warning" />LOW BATT</div></div>
                <div className="statmini"><div className="n tnum">{c.noLock}</div><div className="l"><span className="legend-swatch rc-no-lock" />NO LOCK</div></div>
              </div>
              <div className="card-open-hint">
                Open dashboard
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M5 3l5 5-5 5" /></svg>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">No properties are in your scope yet.</div>
      )}
    </div>
  );
}
