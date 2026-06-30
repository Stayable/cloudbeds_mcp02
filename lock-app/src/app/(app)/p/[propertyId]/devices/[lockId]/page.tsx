import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { unassignedLockName } from "@/lib/lock-naming";
import Forbidden from "@/components/Forbidden";
import ActionButton from "@/components/ActionButton";
import { unmapRoom } from "@/app/(app)/lock-actions";
import { latestLockFault } from "@/lib/lock-fault";
import RoomAssignForm from "./RoomAssignForm";

export const dynamic = "force-dynamic";

export default async function LockDetailPage({ params }: { params: { propertyId: string; lockId: string } }) {
  const { propertyId, lockId: lockIdStr } = params;
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "devices.view", propertyId)) return <Forbidden what="this lock" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;
  if (!/^\d+$/.test(lockIdStr)) return <Forbidden what="this lock" />;
  const lockId = BigInt(lockIdStr);

  const poolName = unassignedLockName(propertyId);
  const [mapped, pooled] = await Promise.all([
    prisma.lockMap.findFirst({ where: { propertyId, lockId } }),
    prisma.unassignedLock.findUnique({ where: { lockId } }),
  ]);

  // The lock belongs here if it's mapped to this property, or it's in this
  // property's available pool (its name is "<ABBR> (unassigned)").
  const inPool = !!pooled && pooled.name === poolName;
  if (!mapped && !inPool) return <Forbidden what="this lock for this property" />;

  const gatewayId = mapped?.gatewayId ?? pooled?.gatewayId ?? null;
  const gateway = gatewayId ? await prisma.gateway.findUnique({ where: { gatewayId } }) : null;

  const name = mapped?.alias?.trim() || pooled?.name?.trim() || `${property.abbr} ${lockIdStr}`;
  const online = mapped?.online ?? pooled?.online ?? false;
  const fault = online ? null : await latestLockFault(lockId);
  const battery = mapped?.battery ?? pooled?.battery ?? null;
  const lastSeen = mapped?.lastSeen ?? pooled?.lastSeen ?? null;
  const battColor = battery == null ? "var(--faint)" : battery < 20 ? "var(--crit-ink)" : "var(--ink)";
  const canEdit = sessionCan(user, "mapping.edit", propertyId);

  return (
    <div>
      <Link href={`/p/${propertyId}/devices`} className="backlink">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M10 13L5 8l5-5" /></svg>All locks
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div className="display" style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>{name}</div>
        <span className={`pill ${online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{online ? "online" : "offline"}</span>
        <span className={`pill ${mapped ? "pill-ok" : "pill-muted"}`}>{mapped ? `Room ${mapped.roomName?.trim() || mapped.roomId}` : "Unassigned"}</span>
      </div>

      <div className="two-col">
        <div className="col">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Lock health</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span className={`pill ${online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{online ? "online" : "offline"}</span>
              {lastSeen && <span className="subtle" style={{ fontSize: 12 }}>Seen {lastSeen.toISOString().slice(0, 16).replace("T", " ")}</span>}
            </div>
            {fault && (
              <div style={{ background: "var(--crit-bg, #fdf0f0)", border: "1px solid var(--crit-line, #f3c9c9)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--crit-ink)" }}>Why offline</div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4 }}>{fault.title}.</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{fault.message}</div>
                <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>{fault.at.toISOString().slice(0, 16).replace("T", " ")} UTC · clears on the next successful action or a Sync</div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", width: 58 }}>Battery</span>
              <div className="batt-track"><div className="batt-bar" style={{ width: `${battery ?? 0}%`, background: battery != null && battery < 20 ? "var(--crit)" : "var(--ok)" }} /></div>
              <span className="mono tnum" style={{ fontWeight: 600, width: 42, textAlign: "right", color: battColor }}>{battery == null ? "—" : `${battery}%`}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline", marginTop: 16 }}>
              <span className="lbl">Lock ID</span><span className="mono">{lockIdStr}</span>
              <span className="lbl">Model</span><span className="mono">{mapped?.model ?? "—"}</span>
              <span className="lbl">Gateway</span>
              {gateway ? (
                <Link href={`/p/${propertyId}/devices/gateways/${gateway.gatewayId}`} className="mono" style={{ color: "var(--blue)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: gateway.online ? "var(--ok)" : "var(--crit)" }} />
                  {gateway.name} · {gateway.online ? "online" : "offline"}
                </Link>
              ) : <span className="mono" style={{ color: "var(--warn-ink)" }}>not connected</span>}
            </div>
          </div>
        </div>

        <div className="col">
          {canEdit && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>{mapped ? "Room assignment" : "Assign to a room"}</div>
              {mapped ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline", marginBottom: 14 }}>
                    <span className="lbl">Room</span>
                    <Link href={`/p/${propertyId}/rooms/${mapped.roomId}`} className="mono" style={{ color: "var(--blue)" }}>{mapped.roomName?.trim() || mapped.roomId}</Link>
                  </div>
                  <ActionButton
                    label="Remove from room" pendingLabel="Removing…"
                    className="btn btn-ghost" style={{ color: "var(--crit-ink)", borderColor: "var(--line-2)" }}
                    confirm="Remove this lock from the room? It returns to the available pool."
                    action={async () => { "use server"; return unmapRoom(propertyId, mapped.roomId); }}
                  />
                  <p className="subtle" style={{ fontSize: 11, marginTop: 8 }}>Renames the lock to “{poolName ?? "(unassigned)"}” and returns it to the available pool.</p>
                </>
              ) : (
                <RoomAssignForm lockId={lockIdStr} propertyId={propertyId} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
