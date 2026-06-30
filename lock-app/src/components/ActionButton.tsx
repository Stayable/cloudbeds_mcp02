"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import ActionError from "./ActionError";
import LoadingOverlay from "./LoadingOverlay";

/**
 * Button that runs a no-arg Server Action returning an ActionResult. Disabled
 * while pending (so a fast double-click can't fire the action twice — the cause
 * of the lock-238 rotate race), shows a dismissible modal on { ok:false }, and
 * refreshes the page's server data on success. Replaces inline <form action> for
 * mutating buttons so failures never crash the route.
 */
export default function ActionButton({
  action,
  label,
  className = "btn btn-navy",
  pendingLabel,
  confirm,
  style,
  loadingLabel,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  className?: string;
  pendingLabel?: string;
  confirm?: string;
  style?: React.CSSProperties;
  /** When set, show a full-screen overlay with this label while the action runs. */
  loadingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      const res = await action();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <button type="button" className={className} disabled={pending} style={style} onClick={run}>
        {pending ? pendingLabel ?? "Working…" : label}
      </button>
      {pending && loadingLabel && <LoadingOverlay label={loadingLabel} />}
      {error && <ActionError message={error} onClose={() => setError(null)} />}
    </>
  );
}
