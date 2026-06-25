import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { toActivityRow, filterEvents, rowTint } from "@/lib/activity";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params, searchParams,
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

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1>Activity log</h1>
          <p className="subtle" style={{ marginTop: 4 }}>{property.name} · every staff action is recorded; sensitive actions are flagged.</p>
        </div>
        <span className="chip chip-warn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: "var(--warn)" }} />= sensitive</span>
        {canExport && <Link href={`/p/${propertyId}/activity/export?${qs}`} className="btn btn-navy" style={{ height: 38 }}>Export CSV</Link>}
      </div>

      <form method="get" style={{ display: "flex", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}>
        <input name="search" placeholder="Search actor / room / lock / detail" defaultValue={searchParams.search ?? ""} className="field" style={{ height: 38, minWidth: 280 }} />
        <input name="action" placeholder="Action (exact)" defaultValue={searchParams.action ?? ""} className="field" style={{ height: 38 }} />
        <button type="submit" className="btn btn-navy" style={{ height: 38 }}>Filter</button>
      </form>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>No activity matches.</div>
        ) : rows.map((r) => {
          const tint = rowTint(r);
          const dot = tint === "red" ? "var(--crit)" : tint === "amber" ? "var(--warn)" : "#C2CBDA";
          const initials = (r.actorEmail ?? r.source).slice(0, 2).toUpperCase();
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: dot, marginTop: 6, flex: "0 0 auto" }} />
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#EAEFF6", color: "var(--ink-2)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontFamily: "var(--font-display-stack)", fontWeight: 600, fontSize: 12 }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{r.actorEmail ?? `system (${r.source})`}</span>{" "}
                  {r.action}{" "}
                  {r.roomId && <span className="mono" style={{ color: "#1E5FB0" }}>{r.roomId}</span>}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 5 }}>
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{r.detail ? ` · ${r.detail}` : ""}
                </div>
              </div>
              {tint === "amber" && <span className="chip chip-warn">SENSITIVE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
