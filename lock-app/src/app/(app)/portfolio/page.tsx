import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, userProperties, sessionCan } from "@/lib/session-access";
import { summarizeProperty } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUserOrRedirect();
  const props = userProperties(user);
  const locks = await prisma.lockMap.findMany({
    where: { propertyId: { in: props.map((p) => p.id) } },
    select: { propertyId: true, online: true, battery: true },
  });
  const cards = props.map((p) =>
    summarizeProperty(p, locks.filter((l) => l.propertyId === p.id).map((l) => ({ online: l.online, battery: l.battery }))),
  );
  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Operations</div>
        <h1>Portfolio</h1>
        <p className="subtle">
          Choose a property to manage — {props.length} {props.length === 1 ? "property" : "properties"} in your scope.
        </p>
        {sessionCan(user, "lock.discover") && (
          <p style={{ marginTop: 8 }}>
            <Link href="/unassigned" style={{ color: "#041E42", fontWeight: 600 }}>
              → Unassigned locks &amp; discovery sync
            </Link>
          </p>
        )}
      </header>

      {cards.length > 0 ? (
        <div className="portfolio-grid" role="list">
          {cards.map((c) => (
            <Link
              key={c.propertyId}
              href={`/p/${c.propertyId}/dashboard`}
              role="listitem"
              className="prop-card"
              style={{ "--status": c.needsAttention ? "var(--crit)" : "var(--ok)" } as React.CSSProperties}
            >
              <div className="prop-name">{c.name}</div>
              <div className="prop-count tnum">
                <strong>{c.totalLocks}</strong> locks · <strong>{c.online}</strong> online
              </div>
              <div className="chips tnum">
                <span className="chip" data-tone={c.offline ? "crit" : undefined}>{c.offline} offline</span>
                <span className="chip" data-tone={c.lowBattery ? "warn" : undefined}>{c.lowBattery} low battery</span>
              </div>
              <div className="prop-status" data-tone={c.needsAttention ? "crit" : "ok"}>
                {c.needsAttention ? `${c.needsAttention} need attention` : "All clear"}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">No properties are in your scope yet.</div>
      )}
    </div>
  );
}
