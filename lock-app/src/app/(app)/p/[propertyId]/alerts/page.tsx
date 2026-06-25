import { getProperty } from "@/lib/properties";

export const dynamic = "force-dynamic";

export default function AlertsPage({ params }: { params: { propertyId: string } }) {
  const property = getProperty(params.propertyId);
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1>Alerts</h1>
        <p className="subtle" style={{ marginTop: 4 }}>{property?.name ?? "Property"} · offline locks and low batteries.</p>
      </div>
      <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 18 18" fill="none" stroke="var(--faint)" strokeWidth={1.4}><path d="M9 2l7 13H2L9 2z" strokeLinejoin="round" /><path d="M9 7v3.5" strokeLinecap="round" /><circle cx="9" cy="12.6" r=".4" fill="var(--faint)" /></svg>
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>No active alerts</div>
        <div style={{ maxWidth: 380 }}>The alerts engine (background battery/offline monitoring) ships with the scheduled-sync phase. Until then, check Devices for live lock status.</div>
      </div>
    </div>
  );
}
