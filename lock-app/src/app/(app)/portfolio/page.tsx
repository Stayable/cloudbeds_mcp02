import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, userProperties, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { summarizeProperty } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUserOrRedirect();
  const props = userProperties(user);
  const locks = await prisma.lockMap.findMany({
    where: { propertyId: { in: props.map((p) => p.id) } },
    select: { propertyId: true, online: true, battery: true },
  });
  const cards = props.map((p) => ({
    ...summarizeProperty(p, locks.filter((l) => l.propertyId === p.id).map((l) => ({ online: l.online, battery: l.battery }))),
    abbr: getProperty(p.id)?.abbr ?? "—",
    locks: locks.filter((l) => l.propertyId === p.id),
  }));

  const totalLocks = locks.length;
  const totOnline = locks.filter((l) => l.online).length;
  const totLowbatt = locks.filter((l) => l.battery != null && l.battery < 20).length;
  const totOffline = locks.filter((l) => !l.online).length;

  const canDiscover = sessionCan(user, "lock.discover");
  const unassignedCount = canDiscover ? await prisma.unassignedLock.count() : 0;

  function dotClass(l: { online: boolean; battery: number | null }) {
    if (!l.online) return "dot-sm dot-crit";
    if (l.battery != null && l.battery < 20) return "dot-sm dot-warn";
    return "dot-sm dot-ok";
  }

  return (
    <div>
      <div className="fleet-head">
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>Fleet heartbeat</h1>
          <p className="subtle" style={{ marginTop: 5 }}>
            {props.length} {props.length === 1 ? "property" : "properties"} · {totalLocks} locks · live status
          </p>
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
              {c.locks.length > 0 && (
                <div className="dotwell" style={{ marginBottom: 14 }}>
                  {c.locks.map((l, i) => <span key={i} className={dotClass(l)} />)}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="prop-stat" style={{ flex: 1 }}><div className="n tnum">{c.online}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--faint)" }}>/{c.totalLocks}</span></div><div className="l">ONLINE</div></div>
                <div className="prop-stat" style={{ flex: 1 }}><div className="n tnum" style={{ color: c.lowBattery ? "var(--warn-ink)" : "var(--ink)" }}>{c.lowBattery}</div><div className="l">LOW BATT</div></div>
                <div className="prop-stat" style={{ flex: 1 }}><div className="n tnum" style={{ color: c.offline ? "var(--crit-ink)" : "var(--ink)" }}>{c.offline}</div><div className="l">OFFLINE</div></div>
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
