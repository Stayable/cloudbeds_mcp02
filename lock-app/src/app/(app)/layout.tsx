import { requireUserOrRedirect, sessionCan, userProperties } from "@/lib/session-access";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  const canDiscover = sessionCan(user, "lock.discover");
  const unassignedCount = canDiscover ? await prisma.unassignedLock.count() : 0;
  const properties = userProperties(user).map((p) => ({ id: p.id, name: p.name, abbr: p.abbr }));

  return (
    <div className="shell">
      <Sidebar
        name={user.name}
        role={user.roleName}
        properties={properties}
        canDiscover={canDiscover}
        canRooms={sessionCan(user, "rooms.view")}
        canDevices={sessionCan(user, "devices.view")}
        canActivity={sessionCan(user, "activity.view")}
        canSettings={sessionCan(user, "settings.manage")}
        canUsers={sessionCan(user, "users.view")}
        unassignedCount={unassignedCount}
      />
      <div className="main">
        <TopBar user={user} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
