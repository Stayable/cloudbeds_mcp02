import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userProperties } from "@/lib/session-access";
import { isBellEvent, unseenCount, recentNotifications, type NotificationItem } from "@/lib/notifications";
import NotificationBell from "./NotificationBell";
import ProfileMenu, { type Prefs } from "./ProfileMenu";

const DEFAULT_PREFS: Prefs = { offline: true, low_battery: true, door_left_open: true, email: false };

export default async function TopBar({ user }: { user: SessionUser }) {
  const propIds = userProperties(user).map((p) => p.id);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true, notificationsSeenAt: true } });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.eventLog.findMany({
    where: { propertyId: { in: propIds }, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  const items: NotificationItem[] = rows
    .filter((r) => isBellEvent(r.action, (r.detail as { outcome?: string } | null)?.outcome))
    .map((r) => ({
      id: r.id,
      message: (r.detail as { message?: string } | null)?.message ?? r.action,
      outcome: ((r.detail as { outcome?: string }).outcome) as "warning" | "failed",
      createdAt: r.createdAt, roomId: r.roomId, propertyId: r.propertyId ?? "",
    }));

  const unseen = unseenCount(items, dbUser?.notificationsSeenAt ?? null);
  const recent = recentNotifications(items, 8).map((i) => ({ id: i.id, message: i.message, outcome: i.outcome, createdAt: i.createdAt.toISOString() }));
  const prefs = { ...DEFAULT_PREFS, ...((dbUser?.notificationPrefs as Partial<Prefs> | null) ?? {}) };

  return (
    <header className="topbar">
      <div className="search" style={{ width: 260 }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="7" cy="7" r="4.5" /><path d="M11 11l3 3" strokeLinecap="round" /></svg>
        <span>Search rooms, locks, codes</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <NotificationBell unseen={unseen} items={recent} />
        <ProfileMenu name={user.name} role={user.roleName} prefs={prefs} />
      </div>
    </header>
  );
}
