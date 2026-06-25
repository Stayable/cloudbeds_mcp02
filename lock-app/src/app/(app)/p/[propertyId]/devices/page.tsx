import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const COLS = "1fr 1fr 1fr .8fr 1.1fr 1fr";

export default async function DevicesPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "devices.view", propertyId)) return <Forbidden what="devices for this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const locks = await prisma.lockMap.findMany({ where: { propertyId }, orderBy: { roomId: "asc" } });
  const online = locks.filter((l) => l.online).length;
  const offline = locks.length - online;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1>All locks</h1>
          <p className="subtle" style={{ marginTop: 4 }}>{locks.length} {locks.length === 1 ? "lock" : "locks"} · {property.name}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="pill pill-ok"><span className="dot" />{online} online</span>
          {offline > 0 && <span className="pill pill-crit"><span className="dot" />{offline} offline</span>}
        </div>
      </div>

      {locks.length === 0 ? (
        <div className="empty">No locks mapped for this property yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div className="table-wrap" style={{ minWidth: 760 }}>
            <div className="thead" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}>
              <span>ROOM</span><span>LOCK ID</span><span>MODEL</span><span>GATEWAY</span><span>BATTERY</span><span style={{ textAlign: "right" }}>STATUS · SEEN</span>
            </div>
            {locks.map((l) => {
              const low = l.battery != null && l.battery < 20;
              return (
                <div key={l.id} className="trow" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{l.alias?.trim() || l.roomId}</span>
                  <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{l.lockId.toString()}</span>
                  <span className="subtle" style={{ fontSize: 13 }}>{l.model ?? "—"}</span>
                  <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{l.gatewayId ? l.gatewayId.toString() : "—"}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="batt-track" style={{ maxWidth: 70 }}><span className="batt-bar" style={{ width: `${l.battery ?? 0}%`, background: low ? "var(--crit)" : "var(--ok)" }} /></span>
                    <span className="mono tnum" style={{ fontWeight: 600, color: low ? "var(--crit-ink)" : "var(--ink)" }}>{l.battery == null ? "—" : `${l.battery}%`}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                    <span className={`pill ${l.online ? "pill-ok" : "pill-crit"}`} style={{ padding: "3px 8px" }}><span className="dot" />{l.online ? "online" : "offline"}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{l.lastSeen ? l.lastSeen.toISOString().slice(5, 16).replace("T", " ") : "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
