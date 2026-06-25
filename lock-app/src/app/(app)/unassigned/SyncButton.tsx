"use client";
import { useFormState, useFormStatus } from "react-dom";
import { runLockSync, type SyncState } from "./actions";

const initial: SyncState = { ran: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ padding: "8px 14px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}
    >
      {pending ? "Syncing…" : "Run discovery sync"}
    </button>
  );
}

/** Runs the discovery sync and shows the result summary inline. */
export default function SyncButton() {
  const [state, action] = useFormState(runLockSync, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Submit />
      {state.error && <span style={{ color: "#c0392b" }}>Error: {state.error}</span>}
      {state.ran && state.summary && (
        <span style={{ color: "#041E42" }}>
          {state.summary.total} locks · mapped {state.summary.mapped} ·
          queued {state.summary.queued} · kept {state.summary.kept}
          {state.summary.errors.length > 0 && ` · ${state.summary.errors.length} errors`}
        </span>
      )}
    </form>
  );
}
