"use client";
import { useFormState, useFormStatus } from "react-dom";
import { runRoomChangeSync, type RoomSyncState } from "@/app/(app)/room-sync-actions";
import LoadingOverlay from "@/components/LoadingOverlay";

const initial: RoomSyncState = { ran: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <LoadingOverlay label="Checking Cloudbeds for room changes…" />}
      <button type="submit" disabled={pending} className="btn btn-ghost" style={{ height: 34, fontSize: 12 }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13 1.5V5H9.5" /></svg>
        {pending ? "Checking…" : "Re-sync room changes"}
      </button>
    </>
  );
}

/**
 * TESTING button (per property): manually runs the middleware reconcile so a room
 * change flipped in Cloudbeds is picked up now, without waiting for the cron.
 * Becomes redundant once the every-5-minute reconcile cron is live on Pro.
 */
export default function RoomChangeSyncButton({ propertyId }: { propertyId: string }) {
  const [state, action] = useFormState(runRoomChangeSync, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <Submit />
      {state.error && <span style={{ fontSize: 12, color: "var(--crit-ink)" }}>Error: {state.error}</span>}
      {state.ran && !state.error && state.created != null && (
        <span className="subtle" style={{ fontSize: 12 }}>{state.created} created · {state.revoked} revoked</span>
      )}
    </form>
  );
}
