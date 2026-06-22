import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";

/** Property-scoped flat nav: property header, the property pages, then a link back
 *  to the Portfolio picker. Admin links (Settings/Users) pinned at the bottom. */
export default function Sidebar({ user, currentProperty }: { user: SessionUser; currentProperty: string }) {
  const p = currentProperty;
  const property = getProperty(p);
  const navLink = { display: "block", padding: "6px 0", color: "#fff", textDecoration: "none" } as const;
  return (
    <nav style={{ width: 220, background: "#041E42", color: "#fff", padding: 16, boxSizing: "border-box" }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>🏠 {property?.name ?? "Property"}</div>
      <div style={{ color: "#9bb", fontSize: 11, marginBottom: 16 }}>Stayable</div>

      <Link href={`/p/${p}/dashboard`} style={navLink}>Dashboard</Link>
      <Link href={`/p/${p}/alerts`} style={navLink}>Alerts</Link>
      {sessionCan(user, "rooms.view", p) && <Link href={`/p/${p}/rooms`} style={navLink}>Rooms</Link>}
      {sessionCan(user, "devices.view", p) && <Link href={`/p/${p}/devices`} style={navLink}>Devices</Link>}
      {sessionCan(user, "activity.view", p) && <Link href={`/p/${p}/activity`} style={navLink}>Activity Log</Link>}

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      <Link href="/portfolio" style={{ ...navLink, color: "#FDDA24" }}>← Portfolio</Link>

      {(sessionCan(user, "settings.manage") || sessionCan(user, "users.manage")) && (
        <>
          <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
          {sessionCan(user, "settings.manage") && <Link href="/settings" style={navLink}>Settings</Link>}
          {sessionCan(user, "users.manage") && <Link href="/users" style={navLink}>Users</Link>}
        </>
      )}
    </nav>
  );
}
