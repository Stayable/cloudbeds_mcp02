"use client";
import { useFormState, useFormStatus } from "react-dom";
import { runOccupancySync, type OccupancyState } from "@/app/(app)/occupancy-actions";

const initial: OccupancyState = { ran: false };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-ghost" style={{ height: 34, fontSize: 12 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13 1.5V5H9.5" /></svg>
      {pending ? "Syncing…" : label}
    </button>
  );
}

/**
 * Rehydrates occupancy from Cloudbeds. Pass a `propertyId` to scope it to one
 * property (Dashboard); omit it to sync every property in scope (Portfolio).
 */
export default function OccupancySyncButton({
  propertyId, label = "Sync occupancy",
}: {
  propertyId?: string;
  label?: string;
}) {
  const [state, action] = useFormState(runOccupancySync, initial);
  const totals = state.results
    ? state.results.reduce(
        (a, r) => ({ occupied: a.occupied + r.occupied, freed: a.freed + r.freed, errors: a.errors + (r.error ? 1 : 0) }),
        { occupied: 0, freed: 0, errors: 0 },
      )
    : null;
  return (
    <form action={action} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <Submit label={label} />
      {state.error && <span style={{ fontSize: 12, color: "var(--crit-ink)" }}>Error: {state.error}</span>}
      {totals && !state.error && (
        <span className="subtle" style={{ fontSize: 12 }}>
          {totals.occupied} occupied · {totals.freed} freed
          {totals.errors > 0 && ` · ${totals.errors} key error${totals.errors === 1 ? "" : "s"}`}
        </span>
      )}
    </form>
  );
}
