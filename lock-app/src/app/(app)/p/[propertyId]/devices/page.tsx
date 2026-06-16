import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

export default async function DevicesPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "devices.view", propertyId)) return <Forbidden what="devices for this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const locks = await prisma.lockMap.findMany({ where: { propertyId }, orderBy: { roomId: "asc" } });
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #041E42", color: "#041E42" } as const;
  const td = { padding: "8px 10px", borderBottom: "1px solid #eee", color: "#041E42" } as const;

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>{property.name} — Devices</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr><th style={th}>Room</th><th style={th}>Lock ID</th><th style={th}>Model</th><th style={th}>Gateway</th><th style={th}>State</th><th style={th}>Battery</th><th style={th}>Last seen</th></tr>
        </thead>
        <tbody>
          {locks.map((l) => (
            <tr key={l.id}>
              <td style={td}>{l.alias?.trim() || l.roomId}</td>
              <td style={td}>{l.lockId.toString()}</td>
              <td style={td}>{l.model ?? "—"}</td>
              <td style={td}>{l.gatewayId ? l.gatewayId.toString() : "—"}</td>
              <td style={{ ...td, color: l.online ? "#2e7d32" : "#c0392b" }}>{l.online ? "online" : "offline"}</td>
              <td style={{ ...td, color: l.battery != null && l.battery < 20 ? "#c0392b" : "#041E42" }}>{l.battery == null ? "—" : `${l.battery}%`}</td>
              <td style={td}>{l.lastSeen ? l.lastSeen.toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {locks.length === 0 && <p style={{ marginTop: 16 }}>No locks mapped for this property yet.</p>}
    </div>
  );
}
