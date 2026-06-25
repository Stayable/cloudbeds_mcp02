import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { PROPERTIES } from "@/lib/properties";
import Forbidden from "@/components/Forbidden";
import SyncButton from "./SyncButton";
import { assignUnassignedLock } from "./actions";

export const dynamic = "force-dynamic";

export default async function UnassignedPage() {
  const user = await requireUserOrRedirect();
  // The discovery sync is account-wide; gate the page on the run permission.
  if (!sessionCan(user, "lock.discover")) return <Forbidden what="lock onboarding" />;
  const canAssign = sessionCan(user, "mapping.edit");

  const queue = await prisma.unassignedLock.findMany({ orderBy: { discoveredAt: "asc" } });

  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #041E42", color: "#041E42" } as const;
  const td = { padding: "8px 10px", borderBottom: "1px solid #eee", color: "#041E42", verticalAlign: "middle" } as const;
  const input = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 } as const;

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>Unassigned locks</h1>
      <p style={{ color: "#444", maxWidth: 720 }}>
        Locks found in the TTLock account whose name does not follow the{" "}
        <code>ABBR-room</code> convention (e.g. <code>KE-105</code>). Assign one here —
        it renames the lock in TTLock to the canonical name and maps it in one step,
        so you never have to open the TTLock app. (Renaming a lock in the TTLock app
        and re-running the sync also works.)
      </p>

      <div style={{ margin: "16px 0" }}>
        <SyncButton />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>Lock name</th>
            <th style={th}>Lock ID</th>
            <th style={th}>Battery</th>
            <th style={th}>Discovered</th>
            {canAssign && <th style={th}>Assign (renames in TTLock)</th>}
          </tr>
        </thead>
        <tbody>
          {queue.map((l) => (
            <tr key={l.lockId.toString()}>
              <td style={td}>{l.name || "—"}</td>
              <td style={td}>{l.lockId.toString()}</td>
              <td style={{ ...td, color: l.battery != null && l.battery < 20 ? "#c0392b" : "#041E42" }}>
                {l.battery == null ? "—" : `${l.battery}%`}
              </td>
              <td style={td}>{l.discoveredAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              {canAssign && (
                <td style={td}>
                  <form action={assignUnassignedLock} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="lockId" value={l.lockId.toString()} />
                    <select name="propertyId" required style={input} defaultValue="">
                      <option value="" disabled>Property…</option>
                      {PROPERTIES.map((p) => (
                        <option key={p.id} value={p.id}>{p.abbr} — {p.name}</option>
                      ))}
                    </select>
                    <input name="room" placeholder="Room" required style={{ ...input, width: 90 }} />
                    <button type="submit" style={{ padding: "6px 12px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}>
                      Assign
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {queue.length === 0 && (
        <p style={{ marginTop: 16 }}>Queue is empty — every discovered lock is mapped. Run the sync to refresh.</p>
      )}
    </div>
  );
}
