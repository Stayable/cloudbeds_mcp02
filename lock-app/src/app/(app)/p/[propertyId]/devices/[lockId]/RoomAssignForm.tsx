"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignLockToRoom } from "@/app/(app)/lock-actions";
import ActionError from "@/components/ActionError";

interface RoomOption {
  roomId: string;
  roomName: string;
  ambiguous: boolean;
}

/**
 * Assign THIS lock (fixed) to a room: pick a room from the property's real
 * Cloudbeds rooms (a dropdown, not free text). The reverse of the room page's
 * lock dropdown. Posts to the shared assignLockToRoom action.
 */
export default function RoomAssignForm({ lockId, propertyId }: { lockId: string; propertyId: string }) {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = await assignLockToRoom(formData);
      if (res.ok) router.refresh();
      else setActionError(res.error);
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!data.ok) { setStatus("error"); setError(data.error ?? "Could not load rooms"); return; }
        if (!data.hasKey) { setStatus("no-key"); return; }
        setRooms(data.rooms ?? []);
        setStatus("ready");
      })
      .catch((e) => { if (!cancelled) { setStatus("error"); setError(String(e?.message ?? e)); } });
    return () => { cancelled = true; };
  }, [propertyId]);

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <input type="hidden" name="lockId" value={lockId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <label className="lbl">ASSIGN TO ROOM</label>
        <select
          name="roomId"
          required
          className="field"
          style={{ width: "100%", height: 44 }}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={status !== "ready" || rooms.length === 0}
        >
          <option value="" disabled>
            {status === "loading" ? "Loading rooms…" : status === "no-key" ? "No Cloudbeds key" : status === "error" ? "Error" : rooms.length === 0 ? "No rooms" : "Room…"}
          </option>
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>{r.ambiguous ? `${r.roomName} (${r.roomId})` : r.roomName}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={!roomId || pending}>{pending ? "Assigning…" : "Assign"}</button>
      {actionError && <ActionError message={actionError} onClose={() => setActionError(null)} />}
      {status === "no-key" && (
        <span className="mono" style={{ flexBasis: "100%", fontSize: 11, color: "#9A5E00" }}>No Cloudbeds key for this property — add CLOUDBEDS_API_KEY_{propertyId}.</span>
      )}
      {status === "error" && error && (
        <span className="mono" style={{ flexBasis: "100%", fontSize: 11, color: "var(--crit-ink)" }}>{error}</span>
      )}
    </form>
  );
}
