"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface DeviceRow {
  lockId: string;
  lockName: string;
  roomLabel: string;
  roomId: string | null;
  model: string | null;
  battery: number | null;
  online: boolean;
  lastSeen: string | null;
  status: "mapped" | "available";
}

type SortKey = "room" | "lockName" | "lockId" | "battery" | "status";
type HealthFilter = "all" | "online" | "offline" | "low" | "unassigned";

const COLS = "1.1fr 1.4fr 1fr .8fr .9fr 1fr";

function cmp(a: DeviceRow, b: DeviceRow, key: SortKey): number {
  switch (key) {
    case "room": return a.roomLabel.localeCompare(b.roomLabel, undefined, { numeric: true });
    case "lockName": return a.lockName.localeCompare(b.lockName, undefined, { numeric: true });
    case "lockId": return a.lockId.localeCompare(b.lockId, undefined, { numeric: true });
    case "battery": return (a.battery ?? -1) - (b.battery ?? -1);
    case "status": return a.status.localeCompare(b.status);
  }
}

export default function DevicesTable({ rows, propertyId }: { rows: DeviceRow[]; propertyId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<HealthFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("room");
  const [asc, setAsc] = useState(true);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.roomLabel.toLowerCase().includes(q) && !r.lockName.toLowerCase().includes(q) && !r.lockId.includes(q)) return false;
      switch (health) {
        case "online": return r.online;
        case "offline": return !r.online;
        case "low": return r.battery != null && r.battery < 20;
        case "unassigned": return r.status === "available";
        default: return true;
      }
    });
    const sorted = [...filtered].sort((a, b) => cmp(a, b, sortKey));
    return asc ? sorted : sorted.reverse();
  }, [rows, search, health, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(true); }
  }
  const arrow = (key: SortKey) => (key === sortKey ? (asc ? " ▲" : " ▼") : "");
  const Th = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <span role="button" onClick={() => toggleSort(k)} style={{ cursor: "pointer", userSelect: "none", textAlign: right ? "right" : "left" }}>{children}{arrow(k)}</span>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}>
        <input placeholder="Search room # / lock name / ID" value={search} onChange={(e) => setSearch(e.target.value)} className="field" style={{ height: 38, minWidth: 220 }} />
        <select value={health} onChange={(e) => setHealth(e.target.value as HealthFilter)} className="field" style={{ height: 38 }}>
          <option value="all">All</option><option value="online">Online</option><option value="offline">Offline</option><option value="low">Low battery</option><option value="unassigned">Unassigned</option>
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="table-wrap" style={{ minWidth: 780 }}>
          <div className="thead" style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}>
            <Th k="room">ROOM</Th><Th k="lockName">LOCK NAME</Th><Th k="lockId">LOCK ID</Th><Th k="status">STATUS</Th><Th k="battery">BATTERY</Th>
            <span style={{ textAlign: "right" }}>ONLINE · SEEN</span>
          </div>
          {view.map((r) => {
            const low = r.battery != null && r.battery < 20;
            return (
              <div
                key={r.lockId}
                className="trow clickable"
                style={{ display: "grid", gridTemplateColumns: COLS, gap: 12 }}
                onClick={() => router.push(`/p/${propertyId}/devices/${r.lockId}`)}
              >
                <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{r.roomLabel}</span>
                <span style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.lockName}</span>
                <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{r.lockId}</span>
                <span><span className={`pill ${r.status === "available" ? "pill-muted" : "pill-ok"}`} style={{ padding: "3px 8px" }}>{r.status === "available" ? "unassigned" : "assigned"}</span></span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="batt-track" style={{ maxWidth: 60 }}><span className="batt-bar" style={{ width: `${r.battery ?? 0}%`, background: low ? "var(--crit)" : "var(--ok)" }} /></span>
                  <span className="mono tnum" style={{ fontWeight: 600, color: low ? "var(--crit-ink)" : "var(--ink)" }}>{r.battery == null ? "—" : `${r.battery}%`}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                  <span className={`pill ${r.online ? "pill-ok" : "pill-crit"}`} style={{ padding: "3px 8px" }}><span className="dot" />{r.online ? "online" : "offline"}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{r.lastSeen ? r.lastSeen.slice(5, 16).replace("T", " ") : "—"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {view.length === 0 && <p className="empty">No locks match.</p>}
    </div>
  );
}
