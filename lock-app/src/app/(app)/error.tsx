"use client";
import { useEffect } from "react";
import Link from "next/link";

/**
 * Segment error boundary. Catches any unexpected throw from a page or Server
 * Action under (app) so the operator sees a friendly card instead of Next's raw
 * "server-side exception / Digest" screen. `reset()` re-renders the segment, and
 * the boundary keeps the router healthy so back/forward navigation still works.
 * (Expected failures are handled in-page via ActionResult + the ActionError modal;
 * this is the last-resort net.)
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface in the browser console for support; server logs hold the real stack.
    console.error("lock-app error boundary:", error);
  }, [error]);

  return (
    <div style={{ maxWidth: 460, margin: "8vh auto", textAlign: "center", padding: 20 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 44, height: 44, borderRadius: 12, marginBottom: 16,
        background: "var(--crit-soft, #fdecec)", color: "var(--crit-ink, #c02626)",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 8v5M12 16.5v.5" /><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
      </div>
      <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
      <p className="subtle" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
        This screen hit an unexpected error. Your data is safe — try again, or head back.
        {error?.digest && <><br /><span className="mono" style={{ fontSize: 11 }}>Ref: {error.digest}</span></>}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button type="button" className="btn btn-navy" onClick={reset}>Try again</button>
        <Link href="/portfolio" className="btn btn-ghost">Back to portfolio</Link>
      </div>
    </div>
  );
}
