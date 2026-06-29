import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  const canDiscover = sessionCan(user, "lock.discover");
  const unassignedCount = canDiscover ? await prisma.unassignedLock.count() : 0;

  return (
    <div className="shell">
      <Sidebar
        name={user.name}
        role={user.roleName}
        canDiscover={canDiscover}
        canRooms={sessionCan(user, "rooms.view")}
        canDevices={sessionCan(user, "devices.view")}
        canActivity={sessionCan(user, "activity.view")}
        canSettings={sessionCan(user, "settings.manage")}
        unassignedCount={unassignedCount}
      />
      <div className="main">
        <TopBar user={user} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
