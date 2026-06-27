"use client";

import { useEffect, useState } from "react";
import { PROPERTIES } from "@/lib/properties";
import { assignUnassignedLock } from "./actions";

interface RoomOption {
  roomId: string;
  roomName: string;
  ambiguous: boolean;
}

/**
 * Assign one queued lock: pick a property, then pick a ROOM from that property's
 * real Cloudbeds rooms (a dropdown, not free text — so the operator can't choose
 * a room that doesn't exist, and the Cloudbeds roomID is matched automatically).
 * The room list loads after a property is chosen; if the property has no Cloudbeds
 * key configured the dropdown is disabled with a notice.
 */
export default function AssignForm({ lockId, guessRoom, defaultPropertyId = "" }: { lockId: string; guessRoom: string; defaultPropertyId?: string }) {
  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "no-key" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setRooms([]); setRoomId(""); setStatus("idle"); setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading"); setRooms([]); setRoomId(""); setError(null);
    fetch(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!data.ok) { setStatus("error"); setError(data.error ?? "Could not load rooms"); return; }
        if (!data.hasKey) { setStatus("no-key"); return; }
        const opts: RoomOption[] = data.rooms ?? [];
        setRooms(opts);
        // Pre-select the room number guessed from the lock's name, if it's a
        // real, unambiguous room for this property.
        const guessMatch = opts.filter((o) => o.roomName === guessRoom);
        if (guessMatch.length === 1) setRoomId(guessMatch[0].roomId);
        setStatus("ready");
      })
      .catch((e) => { if (!cancelled) { setStatus("error"); setError(String(e?.message ?? e)); } });
    return () => { cancelled = true; };
  }, [propertyId, guessRoom]);

  const roomDisabled = status !== "ready" || rooms.length === 0;

  return (
    <form action={assignUnassignedLock} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 260 }}>
      <input type="hidden" name="lockId" value={lockId} />
      <select
        name="propertyId"
        required
        className="field"
        style={{ height: 38 }}
        value={propertyId}
        onChange={(e) => setPropertyId(e.target.value)}
      >
        <option value="" disabled>Property…</option>
        {PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.abbr} — {p.name}</option>)}
      </select>

      <select
        name="roomId"
        required
        className="field"
        style={{ height: 38, minWidth: 130 }}
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        disabled={roomDisabled}
      >
        <option value="" disabled>
          {!propertyId ? "Room…"
            : status === "loading" ? "Loading rooms…"
            : status === "no-key" ? "No Cloudbeds key"
            : status === "error" ? "Error"
            : rooms.length === 0 ? "No rooms"
            : "Room…"}
        </option>
        {rooms.map((r) => (
          <option key={r.roomId} value={r.roomId}>
            {r.ambiguous ? `${r.roomName} (${r.roomId})` : r.roomName}
          </option>
        ))}
      </select>

      <button type="submit" className="btn btn-primary" style={{ height: 38 }} disabled={!roomId}>Assign</button>

      {status === "no-key" && (
        <span className="mono" style={{ flexBasis: "100%", textAlign: "right", fontSize: 11, color: "#9A5E00" }}>
          No Cloudbeds key for this property in lock-app — add CLOUDBEDS_API_KEY_{propertyId}.
        </span>
      )}
      {status === "error" && error && (
        <span className="mono" style={{ flexBasis: "100%", textAlign: "right", fontSize: 11, color: "var(--crit, #c0392b)" }}>
          {error}
        </span>
      )}
    </form>
  );
}
