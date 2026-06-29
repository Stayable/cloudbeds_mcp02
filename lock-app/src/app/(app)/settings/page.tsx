import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import Forbidden from "@/components/Forbidden";
import { saveAccessTiming } from "../settings-actions";
import { CHECKOUT_GRACE_MAX, TRANSFER_GRACE_MAX } from "@/lib/settings";

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

        <form action={saveAccessTiming} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="lbl" htmlFor="checkoutGraceMinutes">CHECKOUT GRACE (MINUTES)</label>
              <input
                id="checkoutGraceMinutes" name="checkoutGraceMinutes" type="number"
                min={0} max={CHECKOUT_GRACE_MAX} defaultValue={checkout}
                className="field" style={{ width: "100%", height: 44 }}
              />
              <p className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
                Headroom after checkout. Kept short (max {CHECKOUT_GRACE_MAX}) — the room turns over to the next guest.
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="lbl" htmlFor="transferGraceMinutes">ROOM-TRANSFER GRACE (MINUTES)</label>
              <input
                id="transferGraceMinutes" name="transferGraceMinutes" type="number"
                min={0} max={TRANSFER_GRACE_MAX} defaultValue={transfer}
                className="field" style={{ width: "100%", height: 44 }}
              />
              <p className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
                Headroom on the old room when a guest moves (max {TRANSFER_GRACE_MAX}).
              </p>
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" style={{ height: 44 }}>Save access timing</button>
          </div>
        </form>

        <p className="subtle" style={{ fontSize: 11, marginTop: 16, color: "var(--warn-ink)" }}>
          Note: values are stored now. The revoke-delay behavior is wired separately once the team sets the
          final timing — until then, codes are revoked immediately regardless of these values.
        </p>
      </div>
    </div>
  );
}
