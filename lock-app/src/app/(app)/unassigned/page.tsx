import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { PROPERTIES } from "@/lib/properties";
import { guessRoomNumber } from "@/lib/lock-naming";
import Forbidden from "@/components/Forbidden";
import SyncButton from "./SyncButton";
import { assignUnassignedLock } from "./actions";

export const dynamic = "force-dynamic";

export default async function UnassignedPage() {
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "lock.discover")) return <Forbidden what="lock onboarding" />;
  const canAssign = sessionCan(user, "mapping.edit");
  const queue = await prisma.unassignedLock.findMany({ orderBy: { discoveredAt: "asc" } });

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1>Unassigned locks</h1>
          <p className="subtle" style={{ marginTop: 4 }}>
            Discovered locks whose name doesn&apos;t match <span className="mono" style={{ color: "var(--ink-2)" }}>ABBR-room</span>.
          </p>
        </div>
        <SyncButton />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--gold-bg)", border: "1px solid var(--gold-border)", borderRadius: 10, padding: "11px 14px", margin: "12px 0 16px", fontSize: 13, color: "#7A6320" }}>
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="#9A5E00" strokeWidth={1.6} style={{ flex: "0 0 auto" }}><path d="M9 2l7 13H2L9 2z" strokeLinejoin="round" /><path d="M9 7v3.5" strokeLinecap="round" /></svg>
        Assigning a lock renames it to the convention and maps it to the room. This action is logged.
      </div>

      {queue.length === 0 ? (
        <div className="empty">Queue is empty — every discovered lock is mapped. Run the sync to refresh.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {queue.map((l) => {
            const low = l.battery != null && l.battery < 20;
            return (
              <div key={l.lockId.toString()} className="card accent-gold" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, padding: "15px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 200, flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: "#FFF6D6", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="#9A5E00" strokeWidth={1.6}><rect x="3" y="7.5" width="12" height="8" rx="1.5" /><path d="M5.5 7.5V5a3.5 3.5 0 017 0" strokeLinecap="round" /></svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>{l.name || "(unnamed)"}</div>
                    <div className="mono" style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, color: "var(--faint)" }}>
                      <span>ID {l.lockId.toString()}</span><span>·</span>
                      <span>{l.battery == null ? "batt —" : `batt ${l.battery}%`}</span>
                    </div>
                  </div>
                </div>
                <span className={`pill ${l.online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{l.online ? "online" : "offline"}</span>
                {canAssign && (
                  <form action={assignUnassignedLock} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 260 }}>
                    <input type="hidden" name="lockId" value={l.lockId.toString()} />
                    <select name="propertyId" required className="field" style={{ height: 38 }} defaultValue="">
                      <option value="" disabled>Property…</option>
                      {PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.abbr} — {p.name}</option>)}
                    </select>
                    <input name="room" placeholder="Room" required defaultValue={guessRoomNumber(l.name)} className="field" style={{ height: 38, width: 90 }} />
                    <button type="submit" className="btn btn-primary" style={{ height: 38 }}>Assign</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
