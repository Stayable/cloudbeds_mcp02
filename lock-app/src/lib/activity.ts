/**
 * Pure view-model for the Activity Log (spec §5). Maps a raw EventLog row into a
 * display row (BigInt lockId -> string; outcome/message pulled from detail json),
 * provides the security tint, the search/filter predicate, and CSV serialization.
 * The page/route do the Prisma reads and feed rows in here.
 */
export type Outcome = "success" | "warning" | "failed";
export type Tint = "none" | "amber" | "red";

export interface ActivityRow {
  id: string;
  createdAt: Date;
  source: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  propertyId: string | null;
  roomId: string | null;
  lockId: string | null;
  detail: string;
  outcome: Outcome;
}

/** Shape of a Prisma EventLog row (only the fields we read). */
export interface RawEvent {
  id: string;
  createdAt: Date;
  source: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  propertyId: string | null;
  roomId: string | null;
  lockId: bigint | null;
  detail: unknown;
}

export function toActivityRow(e: RawEvent): ActivityRow {
  const d = (e.detail && typeof e.detail === "object" ? e.detail : {}) as Record<string, unknown>;
  const outcome: Outcome = d.outcome === "warning" || d.outcome === "failed" ? d.outcome : "success";
  const detail = typeof d.message === "string" && d.message.trim() ? d.message : e.action;
  return {
    id: e.id,
    createdAt: e.createdAt,
    source: e.source,
    action: e.action,
    actorEmail: e.actorEmail,
    actorRole: e.actorRole,
    propertyId: e.propertyId,
    roomId: e.roomId,
    lockId: e.lockId != null ? e.lockId.toString() : null,
    detail,
    outcome,
  };
}

/** Security tint: failures red, code reveals amber, else none. */
export function rowTint(row: { action: string; outcome: string }): Tint {
  if (row.outcome === "failed") return "red";
  if (row.action.includes("reveal")) return "amber";
  return "none";
}

export interface EventFilter {
  search?: string;
  action?: string;
  actor?: string;
  room?: string;
  from?: Date;
  to?: Date;
}

export function filterEvents(rows: ActivityRow[], opts: EventFilter): ActivityRow[] {
  const search = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (search) {
      const hay = [r.actorEmail, r.actorRole, r.roomId, r.lockId, r.action, r.detail]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (opts.action && r.action !== opts.action) return false;
    if (opts.actor && r.actorEmail !== opts.actor) return false;
    if (opts.room && r.roomId !== opts.room) return false;
    if (opts.from && r.createdAt < opts.from) return false;
    if (opts.to && r.createdAt > opts.to) return false;
    return true;
  });
}

const CSV_COLUMNS: Array<[string, (r: ActivityRow) => string]> = [
  ["Timestamp", (r) => r.createdAt.toISOString()],
  ["Source", (r) => r.source],
  ["Actor", (r) => r.actorEmail ?? "system"],
  ["Role", (r) => r.actorRole ?? ""],
  ["Action", (r) => r.action],
  ["Property", (r) => r.propertyId ?? ""],
  ["Room", (r) => r.roomId ?? ""],
  ["Lock", (r) => r.lockId ?? ""],
  ["Outcome", (r) => r.outcome],
  ["Detail", (r) => r.detail],
];

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: ActivityRow[]): string {
  const header = CSV_COLUMNS.map(([h]) => h).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([, fn]) => csvCell(fn(r))).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
