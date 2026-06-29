"use client";
import { useEffect } from "react";

/**
 * Centered, dismissible error modal. Shown when a Server Action returns
 * { ok:false }. Closing only dismisses — it never navigates, so the page and all
 * its data stay loaded underneath. Backdrop click and Esc also close.
 */
export default function ActionError({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(8,12,20,.55)", backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: "var(--card, #fff)",
          borderRadius: 14, border: "1px solid var(--line-2, #e4e7ec)",
          boxShadow: "0 24px 60px rgba(8,12,20,.28)", padding: "22px 22px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 8, flex: "0 0 auto",
            background: "var(--crit-soft, #fdecec)", color: "var(--crit-ink, #c02626)",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 8v5M12 16.5v.5" /><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 4 }}>Couldn’t complete that</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2, #475467)" }}>{message}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{
            border: "none", background: "transparent", cursor: "pointer", padding: 4,
            color: "var(--muted, #98a2b3)", lineHeight: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-navy" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
