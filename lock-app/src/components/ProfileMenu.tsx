"use client";
import { useState } from "react";
import { signOutAction, saveNotificationPrefsAction } from "@/app/(app)/profile-actions";

export interface Prefs { offline: boolean; low_battery: boolean; door_left_open: boolean; email: boolean; }

export default function ProfileMenu({ name, role, prefs }: { name: string; role: string; prefs: Prefs }) {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "6px 0" } as const;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#041E42" }}>
        <span style={{ width: 28, height: 28, borderRadius: 28, background: "#041E42", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span style={{ fontWeight: 600 }}>{name}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 36, width: 260, background: "#fff", border: "1px solid #d7dde6", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 20, padding: 12 }}>
          <div style={{ fontWeight: 700, color: "#041E42" }}>{name}</div>
          <div style={{ color: "#456", fontSize: 12, marginBottom: 10 }}>{role}</div>
          <button onClick={() => setShowPrefs((s) => !s)} style={{ background: "none", border: "none", color: "#041E42", cursor: "pointer", padding: 0, fontSize: 13 }}>
            Notification settings {showPrefs ? "▴" : "▾"}
          </button>
          {showPrefs && (
            <form action={saveNotificationPrefsAction} style={{ margin: "8px 0", padding: 8, background: "#f7f9fc", borderRadius: 6 }}>
              <label style={row}><input type="checkbox" name="offline" defaultChecked={prefs.offline} /> Lock offline</label>
              <label style={row}><input type="checkbox" name="low_battery" defaultChecked={prefs.low_battery} /> Low battery</label>
              <label style={row}><input type="checkbox" name="door_left_open" defaultChecked={prefs.door_left_open} /> Door left open</label>
              <label style={row}><input type="checkbox" name="email" defaultChecked={prefs.email} /> Email me (when delivery ships)</label>
              <button type="submit" style={{ marginTop: 6, padding: "6px 12px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Save</button>
            </form>
          )}
          <hr style={{ border: "none", borderTop: "1px solid #eef", margin: "10px 0" }} />
          <form action={signOutAction}>
            <button type="submit" style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", padding: 0, fontSize: 13 }}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
