"use client";
import { useFormState, useFormStatus } from "react-dom";
import { saveAccessTiming, type AccessTimingState } from "../settings-actions";
import { CHECKOUT_GRACE_MAX, TRANSFER_GRACE_MAX } from "@/lib/settings";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={pending}>
      {pending ? "Saving…" : "Save access timing"}
    </button>
  );
}

/** Access-timing form with a "Saved" confirmation (useFormState). */
export default function AccessTimingForm({ checkout, transfer }: { checkout: number; transfer: number }) {
  const [state, action] = useFormState(saveAccessTiming, { saved: false } as AccessTimingState);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="lbl" htmlFor="checkoutGraceMinutes">CHECKOUT GRACE (MINUTES)</label>
          <input
            id="checkoutGraceMinutes" name="checkoutGraceMinutes" type="number"
            min={0} max={CHECKOUT_GRACE_MAX} defaultValue={checkout}
            className="field" style={{ width: "100%", height: 44 }}
          />
          <p className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
            Headroom after checkout. Kept short (max {CHECKOUT_GRACE_MAX}) — the room turns over to the next guest.
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="lbl" htmlFor="transferGraceMinutes">ROOM-TRANSFER GRACE (MINUTES)</label>
          <input
            id="transferGraceMinutes" name="transferGraceMinutes" type="number"
            min={0} max={TRANSFER_GRACE_MAX} defaultValue={transfer}
            className="field" style={{ width: "100%", height: 44 }}
          />
          <p className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
            Headroom on the old room when a guest moves (max {TRANSFER_GRACE_MAX}).
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <SaveButton />
        {state.saved && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ok-ink)", fontWeight: 600, fontSize: 13 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5L13 4.5" /></svg>
            Saved — checkout {state.checkoutGraceMinutes}m · transfer {state.transferGraceMinutes}m
          </span>
        )}
        {state.error && <span style={{ color: "var(--crit-ink)", fontSize: 13 }}>{state.error}</span>}
      </div>
    </form>
  );
}
