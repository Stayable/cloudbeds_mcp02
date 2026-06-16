import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { toActivityRow, filterEvents, rowTint } from "@/lib/activity";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const TINT: Record<string, string> = { none: "transparent", amber: "#fff7e6", red: "#fdecea" };

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: { propertyId: string };
  searchParams: { search?: string; action?: string };
}) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "activity.view", propertyId)) return <Forbidden what="the activity log" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const events = await prisma.eventLog.findMany({ where: { propertyId }, orderBy: { createdAt: "desc" }, take: 500 });
  const rows = filterEvents(events.map(toActivityRow), { search: searchParams.search, action: searchParams.action });
  const canExport = sessionCan(user, "activity.export", propertyId);
  const qs = new URLSearchParams(searchParams as Record<string, string>).toString();

  const th = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #041E42", color: "#041E42", fontSize: 13 } as const;
  const td = { padding: "6px 8px", borderBottom: "1px solid #eee", color: "#041E42", fontSize: 13 } as const;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ color: "#041E42" }}>{property.name} — Activity Log</h1>
        {canExport && <a href={`/p/${propertyId}/activity/export?${qs}`} style={{ padding: "8px 14px", background: "#FDDA24", color: "#041E42", borderRadius: 6, fontWeight: 700, textDecoration: "none" }}>Export CSV</a>}
      </div>
      <form method="get" style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input name="search" placeholder="Search actor / room / lock / detail" defaultValue={searchParams.search ?? ""} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, minWidth: 280 }} />
        <input name="action" placeholder="Action (exact)" defaultValue={searchParams.action ?? ""} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <button type="submit" style={{ padding: "8px 16px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}>Filter</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={th}>Time (UTC)</th><th style={th}>Actor</th><th style={th}>Action</th><th style={th}>Room</th><th style={th}>Lock</th><th style={th}>Detail</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ background: TINT[rowTint(r)] }}>
              <td style={td}>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={td}>{r.actorEmail ?? `system (${r.source})`}</td>
              <td style={td}>{r.action}</td>
              <td style={td}>{r.roomId ?? "—"}</td>
              <td style={td}>{r.lockId ?? "—"}</td>
              <td style={td}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ marginTop: 16 }}>No activity matches.</p>}
    </div>
  );
}
