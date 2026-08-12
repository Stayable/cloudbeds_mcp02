"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface PropertyNav { id: string; name: string; abbr: string }

/** Persistent navy sidebar: FLEET nav always, PROPERTY nav when inside a property. */
export default function Sidebar({
  name, role, properties, canDiscover, canRooms, canDevices, canActivity, canSettings, canUsers, unassignedCount,
}: {
  name: string;
  role: string;
  properties: PropertyNav[];
  canDiscover: boolean;
  canRooms: boolean;
  canDevices: boolean;
  canActivity: boolean;
  canSettings: boolean;
  canUsers: boolean;
  unassignedCount: number;
}) {
  const path = usePathname() ?? "";
  const pid = path.match(/^\/p\/([^/]+)/)?.[1];
  const is = (href: string) => path === href || path.startsWith(href + "/");
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "—";
  // Property switcher: expanded by default when you're inside a property.
  const [open, setOpen] = useState(!!pid);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Link href="/portfolio"><img src="/brand/stayable-wordmark-white.png" alt="Stayable" /></Link>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-label">Fleet</div>
        {/* Portfolio stays a link; the chevron toggles the property switcher list. */}
        <div className={`navitem navitem-switch${is("/portfolio") ? " active" : ""}`}>
          <Link href="/portfolio" className="navitem-main">
            <Icon.grid /><span>Portfolio</span>
          </Link>
          {properties.length > 0 && (
            <button
              type="button"
              className="navitem-chevron"
              aria-label={open ? "Collapse properties" : "Expand properties"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s ease" }}><path d="M4 6l4 4 4-4" /></svg>
            </button>
          )}
        </div>
        {open && properties.length > 0 && (
          <div className="switcher">
            {properties.map((p) => (
              <Link key={p.id} href={`/p/${p.id}/dashboard`} className={`switcher-item${pid === p.id ? " current" : ""}`}>
                <span className="switcher-abbr">{p.abbr}</span>
                <span className="switcher-name">{p.name}</span>
              </Link>
            ))}
          </div>
        )}
        {canDiscover && (
          <Link href="/unassigned" className={`navitem${is("/unassigned") ? " active" : ""}`}>
            <Icon.lock /><span>Unassigned</span>
            {unassignedCount > 0 && <span className="nav-badge gold">{unassignedCount}</span>}
          </Link>
        )}
        {canUsers && (
          <Link href="/users" className={`navitem${is("/users") ? " active" : ""}`}>
            <Icon.users /><span>Users</span>
          </Link>
        )}
        {canSettings && (
          <Link href="/settings" className={`navitem${is("/settings") ? " active" : ""}`}>
            <Icon.gear /><span>Settings</span>
          </Link>
        )}

        {pid && (
          <>
            <div className="sidebar-label">Property</div>
            <Link href={`/p/${pid}/dashboard`} className={`navitem${is(`/p/${pid}/dashboard`) ? " active" : ""}`}>
              <Icon.squares /><span>Dashboard</span>
            </Link>
            <Link href={`/p/${pid}/alerts`} className={`navitem${is(`/p/${pid}/alerts`) ? " active" : ""}`}>
              <Icon.alert /><span>Alerts</span>
            </Link>
            {canRooms && (
              <Link href={`/p/${pid}/rooms`} className={`navitem${is(`/p/${pid}/rooms`) ? " active" : ""}`}>
                <Icon.building /><span>Rooms</span>
              </Link>
            )}
            {canDevices && (
              <Link href={`/p/${pid}/devices`} className={`navitem${is(`/p/${pid}/devices`) ? " active" : ""}`}>
                <Icon.device /><span>Devices</span>
              </Link>
            )}
            {canActivity && (
              <Link href={`/p/${pid}/activity`} className={`navitem${is(`/p/${pid}/activity`) ? " active" : ""}`}>
                <Icon.pulse /><span>Activity log</span>
              </Link>
            )}
          </>
        )}
      </nav>
      <div className="sidebar-user">
        <div className="avatar">{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm">{name}</div>
          <div className="rl">{role}</div>
        </div>
      </div>
    </aside>
  );
}

const sw = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
const Icon = {
  grid: () => <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="5" cy="5" r="1.7" /><circle cx="13" cy="5" r="1.7" /><circle cx="5" cy="13" r="1.7" /><circle cx="13" cy="13" r="1.7" /></svg>,
  lock: () => <svg {...sw}><rect x="3" y="7.5" width="12" height="8" rx="1.5" /><path d="M5.5 7.5V5a3.5 3.5 0 017 0" strokeLinecap="round" /></svg>,
  squares: () => <svg {...sw}><rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2" /><rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2" /><rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2" /><rect x="10" y="10" width="5.5" height="5.5" rx="1.2" /></svg>,
  alert: () => <svg {...sw}><path d="M9 2l7 13H2L9 2z" strokeLinejoin="round" /><path d="M9 7v3.5" strokeLinecap="round" /><circle cx="9" cy="12.6" r=".4" fill="currentColor" /></svg>,
  building: () => <svg {...sw}><path d="M3 15V4l8-2v13M3 15h12M11 15V6l4 1.5V15" strokeLinejoin="round" /></svg>,
  device: () => <svg {...sw}><rect x="4" y="2.5" width="10" height="13" rx="2" /><path d="M7 6h4M7 9h4M7 12h2" strokeLinecap="round" /></svg>,
  pulse: () => <svg {...sw} strokeLinecap="round"><path d="M2 9h3l1.5-4 3 9 1.5-5H16" /></svg>,
  gear: () => <svg {...sw}><circle cx="9" cy="9" r="2.4" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" strokeLinecap="round" /></svg>,
  users: () => <svg {...sw}><circle cx="7" cy="6" r="2.6" /><path d="M2.5 15c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2" strokeLinecap="round" /><path d="M12.2 4.2a2.4 2.4 0 010 4.6M13.5 14.6c0-2 .6-3 2-3.4" strokeLinecap="round" /></svg>,
};
