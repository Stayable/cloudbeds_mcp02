"use client";
import { useState, useTransition } from "react";

/** Calls a logged reveal Server Action and shows the returned PIN inline. */
export default function RevealButton({
  label, action,
}: {
  label: string;
  action: () => Promise<{ pin: string }>;
}) {
  const [pin, setPin] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (pin) return <code style={{ fontSize: 18, letterSpacing: 2 }}>{pin}</code>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setPin((await action()).pin))}
      style={{ padding: "6px 12px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}
    >
      {pending ? "…" : label}
    </button>
  );
}
