"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import ActionError from "@/components/ActionError";
import { backupCodeLabel, fullCodeName, MAX_LABEL_LEN } from "@/lib/code-naming";

/**
 * Shows a backup slot's name as `<ABBR>-<label>` (e.g. "LL-Maintenance") with a
 * pencil to rename it. Editing reveals an inline field where staff type only the
 * descriptive part — the fixed `<ABBR>-` prefix is shown alongside. Clearing the
 * field resets the slot to the default "Backup {slot}". Read-only (no pencil)
 * when the caller lacks permission or the slot has no code yet.
 */
export default function BackupNameEditor({
  abbr, slot, label, canEdit, action,
}: {
  abbr: string;
  slot: number;
  /** Custom label part, or null for the default "Backup {slot}". */
  label: string | null;
  canEdit: boolean;
  action: (label: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const display = fullCodeName(abbr, backupCodeLabel(slot, label));

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span className="lbl" style={{ fontWeight: 600 }}>{display}</span>
        {canEdit && (
          <button
            type="button"
            aria-label={`Rename backup ${slot}`}
            title="Rename"
            onClick={() => { setValue(label ?? ""); setEditing(true); }}
            style={{ display: "inline-flex", background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--faint)" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" />
            </svg>
          </button>
        )}
      </span>
    );
  }

  function save() {
    start(async () => {
      const res = await action(value);
      if (res.ok) { setEditing(false); router.refresh(); }
      else setError(res.error);
    });
  }

  // Editing UI is an opaque popover anchored to the row (absolute) so it never
  // overlaps the reveal-code / rotate controls in the fixed-width name column.
  return (
    <span
      style={{
        position: "absolute", top: -8, left: 0, zIndex: 20,
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 9,
        padding: "6px 8px", boxShadow: "0 6px 20px rgba(16,24,40,.14)",
      }}
    >
      {abbr && <span className="mono" style={{ fontSize: 13, color: "var(--faint)" }}>{abbr}-</span>}
      <input
        autoFocus
        value={value}
        maxLength={MAX_LABEL_LEN}
        disabled={pending}
        placeholder={`Backup ${slot}`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{ font: "600 13px/1 var(--font-body-stack)", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--line-2)", width: 120 }}
      />
      <button type="button" disabled={pending} onClick={save} className="btn btn-navy" style={{ padding: "7px 10px" }}>
        {pending ? "…" : "Save"}
      </button>
      <button type="button" disabled={pending} onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", fontSize: 12, fontWeight: 600 }}>
        Cancel
      </button>
      {error && <ActionError message={error} onClose={() => setError(null)} />}
    </span>
  );
}
