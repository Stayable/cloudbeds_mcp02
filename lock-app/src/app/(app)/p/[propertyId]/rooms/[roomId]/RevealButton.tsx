"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import ActionError from "@/components/ActionError";

/** Calls a logged reveal Server Action and shows the returned PIN inline.
 *  On failure shows a dismissible modal instead of crashing the page.
 *  variant "onDark" styles for the navy PIN block; "onLight" for white cards. */
export default function RevealButton({
  label, action, variant = "onDark",
}: {
  label: string;
  action: () => Promise<ActionResult<{ pin: string }>>;
  variant?: "onDark" | "onLight";
}) {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (pin) return <span className="mono tnum" style={{ letterSpacing: ".14em" }}>{pin}</span>;

  const dark = variant === "onDark";
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await action();
          if (res.ok && res.data) setPin(res.data.pin);
          else if (!res.ok) setError(res.error);
        })}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9,
          padding: "9px 14px", font: "600 13px/1 var(--font-body-stack)", cursor: "pointer",
          background: dark ? "rgba(255,255,255,.10)" : "#fff",
          border: dark ? "1px solid rgba(255,255,255,.18)" : "1px solid var(--line-2)",
          color: dark ? "#fff" : "var(--ink-2)",
        }}
      >
        {pending ? "…" : label}
      </button>
      {error && <ActionError message={error} onClose={() => setError(null)} />}
    </>
  );
}
