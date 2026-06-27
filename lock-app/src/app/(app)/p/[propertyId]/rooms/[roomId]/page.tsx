import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { splitCodes, type PasscodeInput } from "@/lib/door-detail";
import { loadGuestDetails } from "@/lib/guest-loader";
import { unassignedLockName } from "@/lib/lock-naming";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { loadRoomIndex, resolveNameFromId } from "@/lib/room-resolver";
import Forbidden from "@/components/Forbidden";
import RevealButton from "./RevealButton";
import {
  revealGuestCode, revokeGuestCode, generateManualCode,
  revealBackupCode, rotateBackupCode, syncFromLock,
} from "./actions";
import { assignLockToRoom, unmapRoom } from "@/app/(app)/lock-actions";

export const dynamic = "force-dynamic";

export default async function DoorDetailPage({ params }: { params: { propertyId: string; roomId: string } }) {
  const { propertyId, roomId } = params;
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this room" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const [map, codes, state] = await Promise.all([
    prisma.lockMap.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } }),
    prisma.passcode.findMany({ where: { propertyId, roomId } }),
    prisma.roomState.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } }),
  ]);
  const rows: PasscodeInput[] = codes.map((c) => ({
    keyboardPwdId: String(c.keyboardPwdId), pin: c.pin, type: c.type, status: c.status,
    startTs: Number(c.startTs), endTs: Number(c.endTs),
    reservationId: c.reservationId, createdAt: c.createdAt.getTime(),
  }));
  const { guest, backup, manual, history } = splitCodes(rows, Date.now());
  const can = (p: Parameters<typeof sessionCan>[1]) => sessionCan(user, p, propertyId);

  const battery = map?.battery ?? null;
  const battColor = battery == null ? "var(--faint)" : battery < 20 ? "var(--crit-ink)" : "var(--ink)";

  // Resolve the human room NUMBER. A mapped room has it on the LockMap; an
  // unmapped room only has the Cloudbeds roomID — look the number up so the
  // header reads "104", not "405758-3". Also load the property's available lock
  // pool so an unmapped room can be assigned a lock from a dropdown.
  const registry = CloudbedsRegistry.fromEnv();
  const poolName = unassignedLockName(propertyId);
  const [resolvedNumber, availableLocks] = await Promise.all([
    map?.roomName?.trim()
      ? Promise.resolve(map.roomName.trim())
      : loadRoomIndex(registry, propertyId).then((idx) => (idx ? resolveNameFromId(idx, roomId) : null)).catch(() => null),
    can("mapping.edit") && poolName
      ? prisma.unassignedLock.findMany({ where: { name: poolName }, orderBy: { lockId: "asc" } })
      : Promise.resolve([]),
  ]);
  const roomNumber = resolvedNumber || roomId;
  const label = map?.alias?.trim() || roomNumber;
  const guestDetails = state?.currentReservationId
    ? await loadGuestDetails(propertyId, state.currentReservationId, roomNumber)
    : null;

  return (
    <div>
      <Link href={`/p/${propertyId}/rooms`} className="backlink">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M10 13L5 8l5-5" /></svg>All rooms
      </Link>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div className="display tnum" style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{label}</div>
        <span className={`pill ${state?.guestName ? "pill-warn" : "pill-muted"}`}>{state?.guestName ? "Occupied" : "Vacant"}</span>
        {map && <span className={`pill ${map.online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{map.online ? "online" : "offline"}</span>}
        <div style={{ flex: 1 }} />
        {state?.guestName && (
          <div style={{ textAlign: "right" }}><div className="eyebrow">GUEST</div><div style={{ fontWeight: 600, fontSize: 14, marginTop: 3 }}>{state.guestName}{state.checkoutDate ? ` · out ${state.checkoutDate}` : ""}</div></div>
        )}
      </div>

      {!map && <div className="card accent-warn" style={{ marginBottom: 16, color: "var(--warn-ink)" }}>This room is not mapped to a lock. Map it below to manage codes.</div>}

      <div className="two-col">
        {/* LEFT: codes */}
        <div className="col">
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span className="card-title">Active guest PIN</span>
              {guest && <span className="chip chip-ok">{guest.window}</span>}
            </div>
            {guest ? (
              <>
                <div className="pin-block">
                  <div className="pin-value">
                    {can("guest_code.reveal")
                      ? <RevealButton label={`Reveal ${guest.maskedPin}`} action={async () => { "use server"; return revealGuestCode(propertyId, roomId); }} />
                      : guest.maskedPin}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  {can("guest_code.revoke") && (
                    <form action={async () => { "use server"; await revokeGuestCode(propertyId, roomId); }} style={{ flex: 1 }}>
                      <button className="btn btn-danger" style={{ width: "100%" }}>Revoke code</button>
                    </form>
                  )}
                  {can("lock.sync") && map && (
                    <form action={async () => { "use server"; await syncFromLock(propertyId, roomId); }} style={{ flex: 1 }}>
                      <button className="btn btn-ghost" style={{ width: "100%" }}>Sync from lock</button>
                    </form>
                  )}
                </div>
                {guest.reservationId && <div className="subtle" style={{ marginTop: 10, fontSize: 12 }}>Reservation {guest.reservationId}</div>}
              </>
            ) : <p className="subtle">No active guest code.</p>}
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span className="card-title">Staff backup PIN</span><span className="chip chip-warn">SENSITIVE · OFFLINE</span>
            </div>
            {backup ? (
              <div className="pin-value mono" style={{ color: "var(--ink)", fontSize: 24 }}>
                {can("backup_code.reveal")
                  ? <RevealButton variant="onLight" label={`Reveal ${backup.maskedPin}`} action={async () => { "use server"; return revealBackupCode(propertyId, roomId); }} />
                  : backup.maskedPin}
              </div>
            ) : <p className="subtle">No backup code set.</p>}
            {can("backup_code.rotate") && map && (
              <form action={async () => { "use server"; await rotateBackupCode(propertyId, roomId); }} style={{ marginTop: 14 }}>
                <button className="btn btn-navy">{backup ? "Rotate" : "Create backup code"}</button>
              </form>
            )}
          </div>

          {can("guest_code.generate_manual") && map && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Generate a manual code</div>
              <form action={generateManualCode} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <input type="hidden" name="propertyId" value={propertyId} />
                <input type="hidden" name="roomId" value={roomId} />
                <div><label className="lbl">VALID FOR (HOURS)</label><input name="hours" type="number" min={1} defaultValue={24} className="field" style={{ width: 100, height: 44 }} /></div>
                <button className="btn btn-primary" style={{ height: 44, flex: 1 }}>Generate code</button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT: health + mapping + history */}
        <div className="col">
          {state?.currentReservationId && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Guest</div>
              {guestDetails ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>{guestDetails.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline" }}>
                    <span className="lbl">Room</span><span className="mono">{guestDetails.roomNumber}</span>
                    <span className="lbl">Lease start</span><span className="mono">{guestDetails.leaseStart ?? "—"}</span>
                    <span className="lbl">Lease end</span><span className="mono">{guestDetails.leaseEnd ?? "—"}</span>
                    <span className="lbl">Email</span>
                    <span>{guestDetails.email ? <a href={`mailto:${guestDetails.email}`}>{guestDetails.email}</a> : "—"}</span>
                    <span className="lbl">Phone</span>
                    <span>{guestDetails.phone ? <a href={`tel:${guestDetails.phone}`} className="mono">{guestDetails.phone}</a> : "—"}</span>
                  </div>
                </>
              ) : (
                <p className="subtle">Contact details unavailable — check the Cloudbeds key for this property.</p>
              )}
            </div>
          )}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Lock health</div>
            {map ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                  <span className={`pill ${map.online ? "pill-ok" : "pill-crit"}`}><span className="dot" />{map.online ? "online" : "offline"}</span>
                  {map.lastSeen && <span className="subtle" style={{ fontSize: 12 }}>Seen {map.lastSeen.toISOString().slice(0, 16).replace("T", " ")}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", width: 58 }}>Battery</span>
                  <div className="batt-track"><div className="batt-bar" style={{ width: `${battery ?? 0}%`, background: battery != null && battery < 20 ? "var(--crit)" : "var(--ok)" }} /></div>
                  <span className="mono tnum" style={{ fontWeight: 600, width: 42, textAlign: "right", color: battColor }}>{battery == null ? "—" : `${battery}%`}</span>
                </div>
              </>
            ) : <p className="subtle">No lock mapped.</p>}
          </div>

          {can("mapping.edit") && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Room → lock mapping</div>
              {map ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline", marginBottom: 14 }}>
                    <span className="lbl">Lock</span><span className="mono">{map.alias?.trim() || `Lock ${map.lockId}`}</span>
                    <span className="lbl">Lock ID</span><span className="mono">{String(map.lockId)}</span>
                  </div>
                  <form action={async () => { "use server"; await unmapRoom(propertyId, roomId); }}>
                    <button className="btn btn-ghost" style={{ color: "var(--crit-ink)", borderColor: "var(--line-2)" }}>Remove lock from this room</button>
                  </form>
                  <p className="subtle" style={{ fontSize: 11, marginTop: 8 }}>Removing renames the lock to “{poolName ?? "(unassigned)"}” and returns it to this property’s available pool.</p>
                </>
              ) : availableLocks.length > 0 ? (
                <form action={assignLockToRoom} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="roomId" value={roomId} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label className="lbl">ASSIGN AN AVAILABLE LOCK</label>
                    <select name="lockId" required defaultValue="" className="field" style={{ width: "100%", height: 44 }}>
                      <option value="" disabled>Pick a lock…</option>
                      {availableLocks.map((l) => (
                        <option key={String(l.lockId)} value={String(l.lockId)}>
                          {property.abbr} {String(l.lockId)}{l.battery != null ? ` · ${l.battery}%` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" style={{ height: 44 }}>Assign</button>
                </form>
              ) : (
                <p className="subtle">No available locks in {poolName ? `“${poolName.split(" ")[0]}”` : "this property"}’s pool. Unmap a lock from another room to free one, or assign a brand-new lock from the <span style={{ fontWeight: 600 }}>Unassigned</span> queue.</p>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Code history</div>
            {manual.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {manual.map((m) => <div key={m.keyboardPwdId} className="subtle" style={{ fontSize: 13, padding: "4px 0" }}><span className="mono">{m.maskedPin}</span> · manual · {m.window}</div>)}
              </div>
            )}
            {history.length === 0 ? <p className="subtle">No past codes.</p> : history.map((h) => (
              <div key={h.keyboardPwdId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--divider)" }}>
                <span className="mono" style={{ fontSize: 13 }}>{h.maskedPin}</span>
                <span className="subtle" style={{ fontSize: 12 }}>{h.type} · {h.status}</span>
                <div style={{ flex: 1 }} />
                <span className="subtle mono" style={{ fontSize: 11 }}>{h.reservationId ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
