import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

export default async function GatewayDetailPage({ params }: { params: { propertyId: string; gatewayId: string } }) {
  const { propertyId, gatewayId: gatewayIdStr } = params;
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "devices.view", propertyId)) return <Forbidden what="this gateway" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;
  if (!/^\d+$/.test(gatewayIdStr)) return <Forbidden what="this gateway" />;
  const gatewayId = BigInt(gatewayIdStr);

  const gateway = await prisma.gateway.findUnique({ where: { gatewayId } });
  // The gateway belongs here only if we inferred it serves this property's locks.
  if (!gateway || gateway.propertyId !== propertyId) return <Forbidden what="this gateway for this property" />;

  const [mapped, pooled] = await Promise.all([
    prisma.lockMap.findMany({ where: { gatewayId }, orderBy: { roomId: "asc" } }),
    prisma.unassignedLock.findMany({ where: { gatewayId }, orderBy: { lockId: "asc" } }),
  ]);
  const locks = [
    ...mapped.map((l) => ({ lockId: String(l.lockId), label: l.alias?.trim() || `${property.abbr} ${l.lockId}`, room: l.roomName?.trim() || l.roomId, online: l.online })),
    ...pooled.map((l) => ({ lockId: String(l.lockId), label: l.name?.trim() || `${property.abbr} ${l.lockId}`, room: null as string | null, online: l.online })),
  ];

  return (
    <div>
      <Link href={`/p/${propertyId}/devices`} className="backlink">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M10 13L5 8l5-5" /></svg>All locks
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div className="display" style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>{gateway.name}</div>
        <span className={`pill ${gateway.online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{gateway.online ? "online" : "offline"}</span>
        <span className="pill pill-muted">Gateway</span>
      </div>

      <div className="two-col">
        <div className="col">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Gateway health</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span className={`pill ${gateway.online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{gateway.online ? "online" : "offline"}</span>
              {gateway.lastSeen && <span className="subtle" style={{ fontSize: 12 }}>Seen {gateway.lastSeen.toISOString().slice(0, 16).replace("T", " ")}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline" }}>
              <span className="lbl">Gateway ID</span><span className="mono">{gatewayIdStr}</span>
              <span className="lbl">Network</span><span className="mono">{gateway.networkName ?? "—"}</span>
              <span className="lbl">Locks bound</span><span className="mono">{gateway.lockCount ?? locks.length}</span>
            </div>
            {!gateway.online && (
              <p className="subtle" style={{ fontSize: 12, marginTop: 14, color: "var(--warn-ink)" }}>
                This gateway is offline. Locks that rely on it can’t receive new door codes until it’s back online.
              </p>
            )}
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Locks served ({locks.length})</div>
            {locks.length === 0 ? (
              <p className="subtle">No locks are linked to this gateway yet. Run Sync after the locks come online.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {locks.map((l, i) => (
                  <Link
                    key={l.lockId}
                    href={`/p/${propertyId}/devices/${l.lockId}`}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--divider)" : undefined, color: "var(--ink)" }}
                  >
                    <span className={`dot ${l.online ? "" : ""}`} style={{ width: 8, height: 8, borderRadius: "50%", background: l.online ? "var(--ok)" : "var(--crit)", flex: "0 0 auto" }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{l.label}</span>
                    <span className="subtle mono" style={{ fontSize: 12 }}>{l.room ? `Room ${l.room}` : "unassigned"}</span>
                    <div style={{ flex: 1 }} />
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth={1.8} strokeLinecap="round"><path d="M6 3l5 5-5 5" /></svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
