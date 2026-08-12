import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import Forbidden from "@/components/Forbidden";
import { PROPERTIES } from "@/lib/properties";
import { userStatus, scopeSummary, type ManagedUser } from "@/lib/user-admin";
import AddUserCard from "./AddUserCard";
import UserRow from "./UserRow";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  active: "pill pill-ok",
  invited: "pill pill-warn",
  disabled: "pill pill-muted",
  archived: "pill pill-muted",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
  archived: "Deleted",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await requireUserOrRedirect();
  if (!sessionCan(me, "users.view")) return <Forbidden what="users" />;
  const canManage = sessionCan(me, "users.manage");
  const showArchived = (await searchParams).archived === "1";

  const [rows, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true, email: true, name: true, scopeType: true, propertyIds: true,
        disabledAt: true, archivedAt: true, lastLoginAt: true, createdAt: true,
        role: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const now = new Date();
  const managed: ManagedUser[] = rows.map((u) => ({
    id: u.id, email: u.email, roleName: u.role.name, scopeType: u.scopeType,
    propertyIds: u.propertyIds, disabledAt: u.disabledAt, archivedAt: u.archivedAt,
    lastLoginAt: u.lastLoginAt,
  }));
  const visible = rows.filter((u) => (showArchived ? true : !u.archivedAt));
  const archivedCount = rows.filter((u) => u.archivedAt).length;
  const activeAdmins = managed.filter(
    (u) => u.roleName === "super_admin" && !u.disabledAt && !u.archivedAt,
  ).length;

  const roleNames = roles.map((r) => r.name);
  const properties = PROPERTIES.map((p) => ({ id: p.id, name: p.name, abbr: p.abbr }));

  return (
    <div style={{ maxWidth: 1080 }}>
      <h1>Users</h1>
      <p className="subtle" style={{ marginTop: 4, marginBottom: 20 }}>
        Who can sign in to Stayable Locks · {visible.length} shown
        {canManage ? "" : " · read-only (you don't have users.manage)"}
      </p>

      {canManage && <AddUserCard roleNames={roleNames} properties={properties} />}

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <div className="thead" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.4fr .9fr .9fr auto", gap: 12 }}>
          <div>NAME / EMAIL</div>
          <div>ROLE</div>
          <div>ACCESS</div>
          <div>STATUS</div>
          <div>LAST SIGN-IN</div>
          <div />
        </div>
        {visible.map((u) => {
          const m = managed.find((x) => x.id === u.id)!;
          const status = userStatus(m, now);
          return (
            <UserRow
              key={u.id}
              user={{
                id: u.id,
                name: u.name,
                email: u.email,
                roleName: u.role.name,
                scopeType: u.scopeType,
                propertyIds: u.propertyIds,
                scopeText: scopeSummary(m),
                status,
                statusClass: STATUS_PILL[status],
                statusLabel: STATUS_LABEL[status],
                lastLogin: fmtDate(u.lastLoginAt),
                isSelf: u.id === me.id,
              }}
              canManage={canManage}
              roleNames={roleNames}
              properties={properties}
            />
          );
        })}
        {visible.length === 0 && (
          <div className="trow subtle" style={{ padding: 24 }}>No users to show.</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 16, flexWrap: "wrap" }}>
        <p className="subtle" style={{ fontSize: 12, margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
          There are no passwords — people sign in with a 6-digit code emailed to their address, so adding
          someone here is what grants them access. <strong>Disabled</strong> blocks sign-in immediately and
          ends any open session. <strong>Delete</strong> hides the user but keeps the record, so the Activity
          log can still show what they did.
        </p>
        {archivedCount > 0 && (
          <a className="btn btn-ghost" href={showArchived ? "/users" : "/users?archived=1"} style={{ whiteSpace: "nowrap" }}>
            {showArchived ? "Hide deleted" : `Show deleted (${archivedCount})`}
          </a>
        )}
      </div>

      {activeAdmins === 1 && (
        <p className="subtle" style={{ fontSize: 12, marginTop: 10 }}>
          Only one active super_admin — that account can&apos;t be disabled or deleted until another one exists.
        </p>
      )}
    </div>
  );
}
