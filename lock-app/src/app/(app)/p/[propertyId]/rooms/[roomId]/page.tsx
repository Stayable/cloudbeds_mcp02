import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { splitCodes, type PasscodeInput } from "@/lib/door-detail";
import Forbidden from "@/components/Forbidden";
import RevealButton from "./RevealButton";
import {
  revealGuestCode, revokeGuestCode, generateManualCode,
  revealBackupCode, rotateBackupCode, syncFromLock,
  upsertMapping, deleteMapping,
} from "./actions";

export const dynamic = "force-dynamic";

const NAVY = "#041E42";
const btn = { padding: "8px 16px", color: "#fff", background: NAVY, border: "none", borderRadius: 6 } as const;

export default async function DoorDetailPage({ params }: { params: { propertyId: string; roomId: string } }) {
  const { propertyId, roomId } = params;
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this room" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const [map, codes] = await Promise.all([
    prisma.lockMap.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } }),
    prisma.passcode.findMany({ where: { propertyId, roomId } }),
  ]);
  const rows: PasscodeInput[] = codes.map((c) => ({
    keyboardPwdId: String(c.keyboardPwdId), pin: c.pin, type: c.type, status: c.status,
    startTs: Number(c.startTs), endTs: Number(c.endTs),
    reservationId: c.reservationId, createdAt: c.createdAt.getTime(),
  }));
  const { guest, backup, manual, history } = splitCodes(rows, Date.now());

  const can = (p: Parameters<typeof sessionCan>[1]) => sessionCan(user, p, propertyId);

  return (
    <div style={{ color: NAVY, maxWidth: 760 }}>
      <a href={`/p/${propertyId}/rooms`} style={{ color: NAVY }}>← {property.name} Rooms</a>
      <h1>Room {map?.alias?.trim() || roomId}</h1>

      {!map && (
        <p style={{ color: "#b9770e" }}>This room is not mapped to a lock. Map it below to manage codes.</p>
      )}

      {/* Guest code panel (navy) */}
      <section style={{ background: NAVY, color: "#fff", borderRadius: 10, padding: 16, marginTop: 12 }}>
        <h2 style={{ color: "#FDDA24", marginTop: 0 }}>Guest code</h2>
        {guest ? (
          <>
            <div>Code: {can("guest_code.reveal")
              ? <RevealButton label={`Reveal ${guest.maskedPin}`} action={async () => { "use server"; return revealGuestCode(propertyId, roomId); }} />
              : <code>{guest.maskedPin}</code>}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{guest.window}{guest.reservationId ? ` · res ${guest.reservationId}` : ""}</div>
            {can("guest_code.revoke") && (
              <form action={async () => { "use server"; await revokeGuestCode(propertyId, roomId); }} style={{ marginTop: 10 }}>
                <button style={{ ...btn, background: "#c0392b" }}>Revoke</button>
              </form>
            )}
          </>
        ) : <p>No active guest code.</p>}

        {can("guest_code.generate_manual") && map && (
          <form action={generateManualCode} style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="roomId" value={roomId} />
            <label style={{ fontSize: 13 }}>Manual code for
              <input name="hours" type="number" min={1} defaultValue={24} style={{ width: 64, margin: "0 6px", padding: 4 }} />h</label>
            <button style={btn}>Generate</button>
          </form>
        )}

        {can("lock.sync") && map && (
          <form action={async () => { "use server"; await syncFromLock(propertyId, roomId); }} style={{ marginTop: 10 }}>
            <button style={{ ...btn, background: "#456" }}>Sync from lock</button>
          </form>
        )}
      </section>

      {/* Staff backup code panel (gold dashed) */}
      <section style={{ border: "2px dashed #FDDA24", borderRadius: 10, padding: 16, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Staff backup code <span style={{ fontSize: 12, color: "#456" }}>(works offline)</span></h2>
        {backup ? (
          <div>{can("backup_code.reveal")
            ? <RevealButton label={`Reveal ${backup.maskedPin}`} action={async () => { "use server"; return revealBackupCode(propertyId, roomId); }} />
            : <code>{backup.maskedPin}</code>}</div>
        ) : <p>No backup code set.</p>}
        {can("backup_code.rotate") && map && (
          <form action={async () => { "use server"; await rotateBackupCode(propertyId, roomId); }} style={{ marginTop: 10 }}>
            <button style={btn}>{backup ? "Rotate" : "Create backup code"}</button>
          </form>
        )}
      </section>

      {/* Manual codes */}
      {manual.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3>Manual codes</h3>
          <ul>{manual.map((m) => <li key={m.keyboardPwdId}>{m.maskedPin} · {m.window}</li>)}</ul>
        </section>
      )}

      {/* Code history */}
      <section style={{ marginTop: 16 }}>
        <h3>Code history</h3>
        {history.length === 0 ? <p>None.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${NAVY}` }}>
              <th>Code</th><th>Type</th><th>Status</th><th>Window</th><th>Reservation</th>
            </tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.keyboardPwdId} style={{ borderBottom: "1px solid #e3e8ef" }}>
                <td>{h.maskedPin}</td><td>{h.type}</td><td>{h.status}</td><td>{h.window}</td><td>{h.reservationId ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* Mapping CRUD */}
      {can("mapping.edit") && (
        <section style={{ marginTop: 16, borderTop: `1px solid ${NAVY}`, paddingTop: 12 }}>
          <h3>Lock mapping</h3>
          <form action={upsertMapping} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="roomId" value={roomId} />
            <input name="lockId" placeholder="TTLock Lock ID" defaultValue={map ? String(map.lockId) : ""} style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }} />
            <input name="alias" placeholder="Alias (optional)" defaultValue={map?.alias ?? ""} style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }} />
            <button style={btn}>{map ? "Update mapping" : "Create mapping"}</button>
          </form>
          {map && (
            <form action={async () => { "use server"; await deleteMapping(propertyId, roomId); }} style={{ marginTop: 8 }}>
              <button style={{ ...btn, background: "#c0392b" }}>Remove mapping</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
