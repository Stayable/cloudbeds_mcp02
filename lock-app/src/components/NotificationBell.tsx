"use client";
import { useState } from "react";
import { markSeenAction } from "@/app/(app)/profile-actions";

export interface BellItem { id: string; message: string; createdAt: string; outcome: string; }

export default function NotificationBell({ unseen, items }: { unseen: number; items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unseen > 0) void markSeenAction();
  }
  return (
    <div style={{ position: "relative" }}>
      <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, position: "relative" }}>
        🔔
        {unseen > 0 && (
          <span style={{ position: "absolute", top: -4, right: -6, background: "#c0392b", color: "#fff", borderRadius: 10, fontSize: 10, padding: "0 5px" }}>{unseen}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 28, width: 280, background: "#fff", border: "1px solid #d7dde6", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 20 }}>
          <div style={{ padding: 10, fontWeight: 700, color: "#041E42", borderBottom: "1px solid #eef" }}>Notifications</div>
          {items.length === 0 ? (
            <div style={{ padding: 12, color: "#456", fontSize: 13 }}>Nothing recent.</div>
          ) : items.map((it) => (
            <div key={it.id} style={{ padding: 10, borderBottom: "1px solid #f3f5f8", fontSize: 13 }}>
              <span style={{ color: it.outcome === "failed" ? "#c0392b" : "#b9770e" }}>●</span> {it.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
