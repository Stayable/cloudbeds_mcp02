import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, userProperties } from "@/lib/session-access";
import { summarizeProperty } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
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
    <div>
      <h1 style={{ color: "#041E42" }}>Overview</h1>
      <p style={{ color: "#456" }}>Portfolio health across {props.length} properties.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
        {cards.map((c) => (
          <Link key={c.propertyId} href={`/p/${c.propertyId}/rooms`} style={{ textDecoration: "none" }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 10, padding: 16, color: "#041E42" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{c.name}</div>
              <div style={{ fontSize: 13 }}>{c.totalLocks} locks · {c.online} online</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: c.offline ? "#c0392b" : "#2e7d32" }}>{c.offline} offline</span>
                <span style={{ color: c.lowBattery ? "#b9770e" : "#2e7d32" }}>{c.lowBattery} low battery</span>
              </div>
              <div style={{ marginTop: 10, fontWeight: 700, color: c.needsAttention ? "#c0392b" : "#2e7d32" }}>
                {c.needsAttention ? `${c.needsAttention} need attention` : "All clear"}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {props.length === 0 && <p>No properties are in your scope.</p>}
    </div>
  );
}
