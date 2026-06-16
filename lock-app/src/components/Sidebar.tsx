import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { sessionCan, userProperties } from "@/lib/session-access";
import PropertySwitcher from "./PropertySwitcher";

/** Nav shell (spec §3): portfolio links on top, property-scoped links below the
 *  switcher, admin links at the bottom. Items are permission-gated. */
export default function Sidebar({ user, currentProperty }: { user: SessionUser; currentProperty?: string }) {
  const props = userProperties(user);
  const p = currentProperty ?? props[0]?.id;
  const navLink = { display: "block", padding: "6px 0", color: "#fff", textDecoration: "none" } as const;
  return (
    <nav style={{ width: 220, minHeight: "100vh", background: "#041E42", color: "#fff", padding: 16, boxSizing: "border-box" }}>
      <div style={{ color: "#FDDA24", fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>

      <Link href="/overview" style={navLink}>Overview</Link>
      <Link href="/alerts" style={navLink}>Alerts</Link>

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      {props.length > 0 && <PropertySwitcher properties={props.map((x) => ({ id: x.id, name: x.name }))} current={p} />}
      <div style={{ marginTop: 8 }}>
        {p && sessionCan(user, "rooms.view", p) && <Link href={`/p/${p}/rooms`} style={navLink}>Rooms</Link>}
        {p && sessionCan(user, "activity.view", p) && <Link href={`/p/${p}/activity`} style={navLink}>Activity Log</Link>}
        {p && sessionCan(user, "devices.view", p) && <Link href={`/p/${p}/devices`} style={navLink}>Devices</Link>}
      </div>

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      {sessionCan(user, "settings.manage") && <Link href="/settings" style={navLink}>Settings</Link>}
      {sessionCan(user, "users.manage") && <Link href="/users" style={navLink}>Users</Link>}

      <div style={{ marginTop: 24, fontSize: 12, color: "#9bb" }}>{user.email}<br />{user.roleName}</div>
    </nav>
  );
}
