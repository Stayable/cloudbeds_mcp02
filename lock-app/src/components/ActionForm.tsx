"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import ActionError from "./ActionError";
import LoadingOverlay from "./LoadingOverlay";

/**
 * <form> wrapper for Server Actions that take FormData (inputs/selects). Same
 * guarantees as ActionButton: submit disabled while pending (no double-submit),
 * dismissible modal on { ok:false }, refresh on success. Render the inputs and a
 * submit button as children; the submit button is disabled via the `fieldset`
 * while pending. Pass `submitLabel`-less children when you want full control.
 */
export default function ActionForm({
  action,
  children,
  style,
  loadingLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** When set, show a full-screen overlay with this label while the action runs
   *  (for slow actions like an assign that writes several codes to the lock). */
  loadingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = await action(formData);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} style={style}>
      <fieldset disabled={pending} style={{ border: "none", padding: 0, margin: 0, display: "contents" }}>
        {children}
      </fieldset>
      {pending && loadingLabel && <LoadingOverlay label={loadingLabel} />}
      {error && <ActionError message={error} onClose={() => setError(null)} />}
    </form>
  );
}
