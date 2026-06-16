import { describe, it, expect } from "vitest";
import { toActivityRow, rowTint, filterEvents, toCsv, type ActivityRow } from "./activity";

const at = (s: string) => new Date(s);

describe("toActivityRow", () => {
  it("stringifies BigInt lockId and reads outcome/message from detail json", () => {
    const row = toActivityRow({
      id: "e1", createdAt: at("2026-06-17T12:00:00Z"), source: "webhook", action: "guest_code_created",
      actorEmail: null, actorRole: null, propertyId: "210972", roomId: "101", lockId: 1234567890123n,
      detail: { message: "PIN ••••72 created", outcome: "success" },
    });
    expect(row.lockId).toBe("1234567890123");
    expect(row.detail).toBe("PIN ••••72 created");
    expect(row.outcome).toBe("success");
  });
  it("defaults outcome to success and detail to the action name", () => {
    const row = toActivityRow({
      id: "e2", createdAt: at("2026-06-17T12:00:00Z"), source: "admin", action: "login",
      actorEmail: "a@b.com", actorRole: "super_admin", propertyId: null, roomId: null, lockId: null, detail: null,
    });
    expect(row.outcome).toBe("success");
    expect(row.detail).toBe("login");
    expect(row.lockId).toBeNull();
  });
});

const rows: ActivityRow[] = [
  { id: "1", createdAt: at("2026-06-17T10:00:00Z"), source: "field", action: "code_revealed", actorEmail: "att@x.com", actorRole: "attendant", propertyId: "210972", roomId: "101", lockId: "388", detail: "revealed guest code", outcome: "success" },
  { id: "2", createdAt: at("2026-06-17T11:00:00Z"), source: "webhook", action: "guest_code_created", actorEmail: null, actorRole: null, propertyId: "210972", roomId: "102", lockId: "401", detail: "PIN ••••90 created", outcome: "success" },
  { id: "3", createdAt: at("2026-06-16T09:00:00Z"), source: "cron", action: "guest_code_created", actorEmail: null, actorRole: null, propertyId: "210972", roomId: "103", lockId: "402", detail: "create failed: gateway offline", outcome: "failed" },
];

describe("rowTint", () => {
  it("tints reveals amber and failures red (failure wins)", () => {
    expect(rowTint({ action: "code_revealed", outcome: "success" })).toBe("amber");
    expect(rowTint({ action: "guest_code_created", outcome: "failed" })).toBe("red");
    expect(rowTint({ action: "backup_code_revealed", outcome: "failed" })).toBe("red");
    expect(rowTint({ action: "guest_code_created", outcome: "success" })).toBe("none");
  });
});

describe("filterEvents", () => {
  it("free-text searches across actor, room, lock, action, detail", () => {
    expect(filterEvents(rows, { search: "388" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterEvents(rows, { search: "offline" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterEvents(rows, { search: "att@x" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("filters by action and by room", () => {
    expect(filterEvents(rows, { action: "guest_code_created" }).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterEvents(rows, { room: "101" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("filters by date range inclusive", () => {
    expect(filterEvents(rows, { from: at("2026-06-17T00:00:00Z") }).map((r) => r.id).sort()).toEqual(["1", "2"]);
    expect(filterEvents(rows, { to: at("2026-06-16T23:59:59Z") }).map((r) => r.id)).toEqual(["3"]);
  });
});

describe("toCsv", () => {
  it("emits a header and one line per row", () => {
    const csv = toCsv([rows[0]]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Timestamp");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("code_revealed");
  });
  it("escapes quotes and commas", () => {
    const csv = toCsv([{ ...rows[0], detail: 'has, comma and "quote"' }]);
    expect(csv).toContain('"has, comma and ""quote"""');
  });
});
