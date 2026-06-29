import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import Forbidden from "@/components/Forbidden";
import AccessTimingForm from "./AccessTimingForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "settings.manage")) return <Forbidden what="settings" />;

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const checkout = settings?.checkoutGraceMinutes ?? 0;
  const transfer = settings?.transferGraceMinutes ?? 0;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Settings</h1>
      <p className="subtle" style={{ marginTop: 4, marginBottom: 20 }}>System-wide configuration · {user.roleName}</p>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Access timing</div>
        <p className="subtle" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 18 }}>
          How long a guest’s door code keeps working after they leave a room, before it’s revoked.
          <strong> 0 = revoke immediately</strong> (today’s behavior). Higher values give headroom so a guest
          isn’t locked out mid-move or while grabbing belongings — reducing attendant call-outs.
        </p>

        <AccessTimingForm checkout={checkout} transfer={transfer} />

        <p className="subtle" style={{ fontSize: 11, marginTop: 16 }}>
          Applies live to checkout and room-transfer revokes — no redeploy needed. 0 = revoke immediately.
        </p>
      </div>
    </div>
  );
}
