# Lock-App Read Surfaces Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated app shell (hybrid nav + property switcher) and the four read-only surfaces — Overview (portfolio health), Rooms (occupancy + lock health + masked code), Devices (lock inventory), and Activity Log (search/filter/CSV export) — all reading the Neon data the Foundation laid.

**Architecture:** All conversion/aggregation/filter logic lives in pure, unit-tested functions in `src/lib/` (`properties.ts`, `rooms.ts`, `overview.ts`, `activity.ts`). React Server Components are thin: they fetch with Prisma, call the pure functions, and render. Filtering is done server-side via `searchParams` + GET `<form>`s (no client-state needed except the property switcher). Property-scoped pages live under `/p/[propertyId]/…`; portfolio pages at `/overview`. Authorization reuses the Foundation's `hasPermission`/scope; a session helper gates nav items and each page.

**Tech Stack:** Next.js 14 (App Router, RSC), React 18, Prisma 5, TypeScript, Tailwind, Vitest. No new dependencies.

**Builds on (Foundation, Plan 1):** `src/lib/db.ts` (prisma singleton), `src/lib/auth.ts` (`getSession`, `SessionUser`), `src/lib/rbac.ts` (`requireAuth`/`requirePermission`/`AuthError`), `src/lib/permissions.ts` (`PERMISSIONS`, `hasPermission`, `ActorPermissions`, `Permission`), schema (`LockMap` w/ health, `RoomState`, `Passcode` w/ `type`, `EventLog` w/ actor cols).

---

## File Structure

```
lock-app/
  prisma/
    seed-dev.ts                         # DEV-ONLY sample data for 2 properties (Task 5)
  src/
    lib/
      properties.ts  + .test.ts         # 8-property catalog + scope filter (Task 1)
      rooms.ts       + .test.ts         # maskPin, occupancyColor, toRoomTile, filterRoomTiles (Task 2)
      overview.ts    + .test.ts         # summarizeProperty (Task 3)
      activity.ts    + .test.ts         # toActivityRow, rowTint, filterEvents, toCsv (Task 4)
      session-access.ts                 # sessionCan() + requireVisibleProperty() (Task 6)
    components/
      Sidebar.tsx                       # nav (server, permission-gated) (Task 6)
      PropertySwitcher.tsx              # client <select> -> router.push (Task 6)
      Forbidden.tsx                     # 403 panel (Task 6)
    app/
      (app)/
        layout.tsx                      # auth gate + shell (Task 6)
        overview/page.tsx               # portfolio cards (Task 7)
        alerts/page.tsx                 # stub -> "coming soon (Plan 4)" (Task 6)
        p/[propertyId]/
          rooms/page.tsx                # room grid (Task 8)
          devices/page.tsx              # lock inventory table (Task 9)
          activity/page.tsx             # activity log + filters (Task 10)
          activity/export/route.ts      # CSV download (Task 10)
      page.tsx                          # redirect / -> /overview (Task 11)
```

**Decisions locked here:**
- **No `Property` table.** The 8 properties are a static catalog (`lib/properties.ts`) sourced from `CLAUDE.md`'s verified Cloudbeds IDs. Per-property *config* (editable name/timezone) is deferred to Settings (Plan 5) — YAGNI for read surfaces.
- **Server-side filtering** via `searchParams`, not client state. The pure filter fns are tested; pages just pass `searchParams` through. Only `PropertySwitcher` is a client component.
- **BigInt stays server-side.** `lockId` (`BigInt`) is converted to `string` inside the view-model mappers, so no value crosses into a client component (Next can't serialize BigInt).
- **`outcome` is read from `EventLog.detail.outcome`** (Json), defaulting to `"success"` — the Foundation schema has no `outcome` column and Plan 2 adds no schema. Writers (Plans 3–4) populate `detail.outcome`.
- **Alerts** is a nav stub only (engine is Plan 4); included so the §3 nav isn't a dead link.

---

## Task 1: Property catalog + scope filter (TDD)

**Files:**
- Create: `lock-app/src/lib/properties.ts`
- Test: `lock-app/src/lib/properties.test.ts`

- [ ] **Step 1: Write the failing test `lock-app/src/lib/properties.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { PROPERTIES, getProperty, visibleProperties } from "./properties";

describe("property catalog", () => {
  it("has all 8 Stayable properties with real Cloudbeds IDs", () => {
    expect(PROPERTIES).toHaveLength(8);
    expect(getProperty("210972")?.name).toBe("Lakeland");
    expect(getProperty("206628")?.name).toBe("Jacksonville North");
  });

  it("returns undefined for an unknown id", () => {
    expect(getProperty("999")).toBeUndefined();
  });

  it("gives an 'all'-scope user every property", () => {
    expect(visibleProperties({ scopeType: "all", propertyIds: [] })).toHaveLength(8);
  });

  it("limits a 'property'-scope user to their assigned ids", () => {
    const v = visibleProperties({ scopeType: "property", propertyIds: ["210972", "210986"] });
    expect(v.map((p) => p.id).sort()).toEqual(["210972", "210986"]);
  });

  it("returns no properties for a 'property'-scope user with no ids", () => {
    expect(visibleProperties({ scopeType: "property", propertyIds: [] })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/properties.test.ts`
Expected: FAIL — `Cannot find module './properties'`.

- [ ] **Step 3: Create `lock-app/src/lib/properties.ts`**

```ts
/**
 * Static catalog of the 8 Stayable properties. IDs are the REAL Cloudbeds
 * propertyIDs (verified live, see CLAUDE.md) — NOT the street-address codes.
 * Editable per-property config (name/timezone overrides) is a Settings concern
 * (Plan 5); this is the read-only source for nav, switcher, and Overview.
 */
export interface Property {
  id: string; // real Cloudbeds propertyID
  name: string;
  streetCode: string; // legacy street-address code (display/reference only)
  timezone: string;
}

export const PROPERTIES: Property[] = [
  { id: "206628", name: "Jacksonville North", streetCode: "812", timezone: "America/New_York" },
  { id: "210987", name: "Jacksonville West", streetCode: "6802", timezone: "America/New_York" },
  { id: "210986", name: "Kissimmee East", streetCode: "2295", timezone: "America/New_York" },
  { id: "210969", name: "Kissimmee West", streetCode: "5399", timezone: "America/New_York" },
  { id: "210972", name: "Lakeland", streetCode: "4645", timezone: "America/New_York" },
  { id: "210971", name: "Orlando OBT", streetCode: "8700", timezone: "America/New_York" },
  { id: "208155", name: "St. Augustine", streetCode: "2535", timezone: "America/New_York" },
  { id: "318197", name: "Davenport", streetCode: "44199", timezone: "America/New_York" },
];

export function getProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

/**
 * Properties a user may see. `all` -> every property; otherwise the explicit
 * `propertyIds`. (For `group` scope, the caller resolves the group's member ids
 * into `propertyIds` before calling — see session-access.ts.)
 */
export function visibleProperties(scope: {
  scopeType: string;
  propertyIds: readonly string[];
}): Property[] {
  if (scope.scopeType === "all") return PROPERTIES;
  return PROPERTIES.filter((p) => scope.propertyIds.includes(p.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/properties.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/properties.ts lock-app/src/lib/properties.test.ts
git commit -m "Add property catalog + scope filter (TDD)"
```

---

## Task 2: Room tile view-model (TDD)

**Files:**
- Create: `lock-app/src/lib/rooms.ts`
- Test: `lock-app/src/lib/rooms.test.ts`

- [ ] **Step 1: Write the failing test `lock-app/src/lib/rooms.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { maskPin, occupancyColor, toRoomTile, filterRoomTiles, type RoomTileInput } from "./rooms";

const base: RoomTileInput = {
  roomId: "101", alias: null, online: true, battery: 80,
  occupancyStatus: "free", guestName: null, checkoutDate: null, activePin: null,
};

describe("maskPin", () => {
  it("masks all but the last two digits", () => {
    expect(maskPin("123472")).toBe("••••72");
  });
  it("handles short pins without negative repeat", () => {
    expect(maskPin("72")).toBe("72");
  });
});

describe("occupancyColor", () => {
  it("maps occupancy to functional colors", () => {
    expect(occupancyColor("occupied")).toBe("red");
    expect(occupancyColor("reserved")).toBe("amber");
    expect(occupancyColor("free")).toBe("green");
  });
});

describe("toRoomTile", () => {
  it("flags low battery under 20%", () => {
    expect(toRoomTile({ ...base, battery: 15 }).batteryLow).toBe(true);
    expect(toRoomTile({ ...base, battery: 25 }).batteryLow).toBe(false);
  });
  it("masks an active code and passes guest fields through", () => {
    const t = toRoomTile({ ...base, occupancyStatus: "occupied", guestName: "A. Guest", checkoutDate: "2026-06-20", activePin: "445590" });
    expect(t.maskedCode).toBe("••••90");
    expect(t.occupancyColor).toBe("red");
    expect(t.guestName).toBe("A. Guest");
  });
  it("uses the alias as label when present, else the room id", () => {
    expect(toRoomTile({ ...base, alias: "Suite A" }).label).toBe("Suite A");
    expect(toRoomTile(base).label).toBe("101");
  });
  it("has no masked code when there is no active pin", () => {
    expect(toRoomTile(base).maskedCode).toBeNull();
  });
});

describe("filterRoomTiles", () => {
  const tiles = [
    toRoomTile({ ...base, roomId: "101", occupancyStatus: "occupied", online: true, battery: 90 }),
    toRoomTile({ ...base, roomId: "102", occupancyStatus: "free", online: false, battery: 50 }),
    toRoomTile({ ...base, roomId: "203", occupancyStatus: "reserved", online: true, battery: 10 }),
  ];
  it("filters by room-number search", () => {
    expect(filterRoomTiles(tiles, { search: "10" }).map((t) => t.roomId)).toEqual(["101", "102"]);
  });
  it("filters by occupancy", () => {
    expect(filterRoomTiles(tiles, { occupancy: "occupied" }).map((t) => t.roomId)).toEqual(["101"]);
  });
  it("filters by health=offline and health=low_battery", () => {
    expect(filterRoomTiles(tiles, { health: "offline" }).map((t) => t.roomId)).toEqual(["102"]);
    expect(filterRoomTiles(tiles, { health: "low_battery" }).map((t) => t.roomId)).toEqual(["203"]);
  });
  it("returns all tiles when filters are 'all' or empty", () => {
    expect(filterRoomTiles(tiles, {})).toHaveLength(3);
    expect(filterRoomTiles(tiles, { occupancy: "all", health: "all", search: "" })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/rooms.test.ts`
Expected: FAIL — `Cannot find module './rooms'`.

- [ ] **Step 3: Create `lock-app/src/lib/rooms.ts`**

```ts
/**
 * Pure view-model for the Rooms grid. Joins a room's mapping (LockMap, incl.
 * health columns), occupancy (RoomState), and its active guest code (Passcode)
 * into one tile, and provides search/filter over the resulting tiles. The page
 * does the Prisma reads and feeds plain objects in here.
 */
export type Occupancy = "free" | "reserved" | "occupied";
export type StatusColor = "red" | "amber" | "green";
export type HealthFilter = "all" | "online" | "offline" | "low_battery";

const LOW_BATTERY_PCT = 20; // spec §9 threshold

export interface RoomTileInput {
  roomId: string;
  alias?: string | null;
  online: boolean;
  battery: number | null;
  occupancyStatus: Occupancy;
  guestName?: string | null;
  checkoutDate?: string | null;
  /** Raw pin of the active guest code, if any. Masked before display. */
  activePin?: string | null;
}

export interface RoomTile {
  roomId: string;
  label: string;
  occupancy: Occupancy;
  occupancyColor: StatusColor;
  online: boolean;
  battery: number | null;
  batteryLow: boolean;
  maskedCode: string | null;
  guestName: string | null;
  checkoutDate: string | null;
}

/** Mask all but the last two characters: "123472" -> "••••72". */
export function maskPin(pin: string): string {
  return "•".repeat(Math.max(0, pin.length - 2)) + pin.slice(-2);
}

export function occupancyColor(o: Occupancy): StatusColor {
  if (o === "occupied") return "red";
  if (o === "reserved") return "amber";
  return "green";
}

export function toRoomTile(input: RoomTileInput): RoomTile {
  return {
    roomId: input.roomId,
    label: input.alias?.trim() ? input.alias : input.roomId,
    occupancy: input.occupancyStatus,
    occupancyColor: occupancyColor(input.occupancyStatus),
    online: input.online,
    battery: input.battery,
    batteryLow: input.battery != null && input.battery < LOW_BATTERY_PCT,
    maskedCode: input.activePin ? maskPin(input.activePin) : null,
    guestName: input.guestName ?? null,
    checkoutDate: input.checkoutDate ?? null,
  };
}

export interface RoomFilter {
  search?: string;
  occupancy?: Occupancy | "all";
  health?: HealthFilter;
}

export function filterRoomTiles(tiles: RoomTile[], opts: RoomFilter): RoomTile[] {
  const search = (opts.search ?? "").trim().toLowerCase();
  return tiles.filter((t) => {
    if (search && !t.roomId.toLowerCase().includes(search) && !t.label.toLowerCase().includes(search)) {
      return false;
    }
    if (opts.occupancy && opts.occupancy !== "all" && t.occupancy !== opts.occupancy) return false;
    switch (opts.health) {
      case "online":
        return t.online;
      case "offline":
        return !t.online;
      case "low_battery":
        return t.batteryLow;
      default:
        return true;
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/rooms.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/rooms.ts lock-app/src/lib/rooms.test.ts
git commit -m "Add room tile view-model + filter (TDD)"
```

---

## Task 3: Overview aggregation (TDD)

**Files:**
- Create: `lock-app/src/lib/overview.ts`
- Test: `lock-app/src/lib/overview.test.ts`

- [ ] **Step 1: Write the failing test `lock-app/src/lib/overview.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { summarizeProperty, type LockHealth } from "./overview";
import { getProperty } from "./properties";

const lakeland = getProperty("210972")!;

describe("summarizeProperty", () => {
  it("counts online / offline / low-battery and derives needsAttention", () => {
    const locks: LockHealth[] = [
      { online: true, battery: 90 },
      { online: true, battery: 10 }, // low battery
      { online: false, battery: 50 }, // offline
      { online: false, battery: 5 }, // offline AND low -> counts once toward needsAttention
    ];
    const s = summarizeProperty(lakeland, locks);
    expect(s).toMatchObject({
      propertyId: "210972",
      name: "Lakeland",
      totalLocks: 4,
      online: 2,
      offline: 2,
      lowBattery: 2,
      needsAttention: 3, // unique locks that are offline OR low battery
    });
  });

  it("treats a property with no locks as all-zero", () => {
    expect(summarizeProperty(lakeland, [])).toMatchObject({
      totalLocks: 0, online: 0, offline: 0, lowBattery: 0, needsAttention: 0,
    });
  });

  it("ignores null battery for the low-battery count", () => {
    const s = summarizeProperty(lakeland, [{ online: true, battery: null }]);
    expect(s.lowBattery).toBe(0);
    expect(s.needsAttention).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/overview.test.ts`
Expected: FAIL — `Cannot find module './overview'`.

- [ ] **Step 3: Create `lock-app/src/lib/overview.ts`**

```ts
/**
 * Portfolio aggregation for the Overview screen: per-property lock-health counts.
 * "needsAttention" = locks that are offline OR low-battery, counted once each
 * (a lock that is both still counts as one). Alert *records* arrive in Plan 4;
 * until then this derived count is the at-a-glance "is anything broken?" signal.
 */
import type { Property } from "./properties";

const LOW_BATTERY_PCT = 20;

export interface LockHealth {
  online: boolean;
  battery: number | null;
}

export interface PropertyHealth {
  propertyId: string;
  name: string;
  totalLocks: number;
  online: number;
  offline: number;
  lowBattery: number;
  needsAttention: number;
}

export function summarizeProperty(property: Property, locks: LockHealth[]): PropertyHealth {
  let online = 0;
  let offline = 0;
  let lowBattery = 0;
  let needsAttention = 0;
  for (const lock of locks) {
    const isLow = lock.battery != null && lock.battery < LOW_BATTERY_PCT;
    if (lock.online) online++;
    else offline++;
    if (isLow) lowBattery++;
    if (!lock.online || isLow) needsAttention++;
  }
  return {
    propertyId: property.id,
    name: property.name,
    totalLocks: locks.length,
    online,
    offline,
    lowBattery,
    needsAttention,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/overview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/overview.ts lock-app/src/lib/overview.test.ts
git commit -m "Add Overview per-property health aggregation (TDD)"
```

---

## Task 4: Activity-log view-model: map, tint, filter, CSV (TDD)

**Files:**
- Create: `lock-app/src/lib/activity.ts`
- Test: `lock-app/src/lib/activity.test.ts`

- [ ] **Step 1: Write the failing test `lock-app/src/lib/activity.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/activity.test.ts`
Expected: FAIL — `Cannot find module './activity'`.

- [ ] **Step 3: Create `lock-app/src/lib/activity.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/activity.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/activity.ts lock-app/src/lib/activity.test.ts
git commit -m "Add activity-log view-model: map/tint/filter/CSV (TDD)"
```

---

## Task 5: Dev sample data seed

**Files:**
- Create: `lock-app/prisma/seed-dev.ts`
- Modify: `lock-app/package.json` (add `db:seed:dev` script)

This seeds realistic data for **two** properties (Lakeland `210972`, Kissimmee East `210986`) so the read surfaces render populated, and a `super_admin` user so you can sign in. Idempotent: it deletes its own rows for those two properties first, then recreates. Safe to re-run; never run in production.

- [ ] **Step 1: Add the dev-seed script to `lock-app/package.json`**

In the `"scripts"` block, after the `"db:seed"` line, add:

```json
    "db:seed:dev": "tsx prisma/seed-dev.ts",
```

- [ ] **Step 2: Create `lock-app/prisma/seed-dev.ts`**

```ts
/**
 * DEV-ONLY sample data for the read surfaces (Plan 2). Seeds LockMap (with health),
 * RoomState (occupancy), active Passcodes, and a spread of EventLog rows for two
 * properties, plus a super_admin user. Idempotent: clears its own rows for those
 * two properties, then recreates. DO NOT run against production.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROPS = ["210972", "210986"]; // Lakeland, Kissimmee East
const ADMIN_EMAIL = "bke@rise8companies.com";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// roomId, lockId, online, battery, occupancy, guest, checkout, activePin
type Row = [string, number, boolean, number, "free" | "reserved" | "occupied", string | null, string | null, string | null];
const ROOMS: Record<string, Row[]> = {
  "210972": [
    ["101", 388, true, 92, "occupied", "Jordan Reyes", "2026-06-20", "445572"],
    ["102", 401, true, 14, "reserved", "Sam Carter", "2026-06-21", null],
    ["103", 402, false, 60, "free", null, null, null],
    ["104", 403, true, 78, "occupied", "Lee Nguyen", "2026-06-19", "778890"],
  ],
  "210986": [
    ["201", 511, true, 55, "free", null, null, null],
    ["202", 512, false, 9, "occupied", "Pat Morgan", "2026-06-18", "120066"],
    ["203", 513, true, 88, "reserved", "Robin Diaz", "2026-06-22", null],
  ],
};

async function main() {
  // 1. super_admin user (role seeded by prisma/seed.ts)
  const role = await prisma.role.findUnique({ where: { name: "super_admin" } });
  if (!role) throw new Error("super_admin role missing — run `npm run db:seed` first.");
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { roleId: role.id, scopeType: "all", name: "BK Estocapio" },
    create: { email: ADMIN_EMAIL, name: "BK Estocapio", roleId: role.id, scopeType: "all" },
  });

  // 2. clear this seed's rows for the two properties (idempotency)
  await prisma.passcode.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.eventLog.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.roomState.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.lockMap.deleteMany({ where: { propertyId: { in: PROPS } } });

  // 3. recreate per property
  for (const propertyId of PROPS) {
    for (const [roomId, lockId, online, battery, occ, guest, checkout, pin] of ROOMS[propertyId]) {
      await prisma.lockMap.create({
        data: {
          propertyId, roomId, lockId: BigInt(lockId), alias: null,
          online, battery, lastSeen: new Date(now - 5 * 60 * 1000), model: "TTLock 8072", gatewayId: BigInt(9000),
        },
      });
      await prisma.roomState.create({
        data: { propertyId, roomId, occupancyStatus: occ, guestName: guest, checkoutDate: checkout },
      });
      if (pin) {
        await prisma.passcode.create({
          data: {
            reservationId: `RES-${propertyId}-${roomId}`, propertyId, roomId, lockId: BigInt(lockId),
            keyboardPwdId: BigInt(lockId * 10), pin, startTs: BigInt(now - day), endTs: BigInt(now + 2 * day),
            status: "active", type: "guest",
          },
        });
      }
    }
    // a spread of activity rows incl. a reveal (amber) and a failure (red)
    await prisma.eventLog.createMany({
      data: [
        { source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: "101", lockId: BigInt(388), detail: { message: "PIN ••••72 created", outcome: "success" } },
        { source: "field", event: "ui", action: "code_revealed", propertyId, roomId: "101", lockId: BigInt(388), actorEmail: ADMIN_EMAIL, actorRole: "super_admin", detail: { message: "revealed guest code", outcome: "success" } },
        { source: "cron", event: "health", action: "low_battery", propertyId, roomId: "102", lockId: BigInt(401), detail: { message: "battery 14%", outcome: "warning" } },
        { source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: "103", lockId: BigInt(402), detail: { message: "create failed: gateway offline", outcome: "failed" } },
      ],
    });
  }
  console.log(`Dev seed complete: ${PROPS.length} properties, user ${ADMIN_EMAIL}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Run the dev seed (Neon is reachable from this environment)**

Run:
```bash
cd lock-app && npm run db:seed && npm run db:seed:dev
```
Expected: "Seeded 3 roles." then "Dev seed complete: 2 properties, user bke@rise8companies.com."

> If `DATABASE_URL` is not present in `lock-app/.env`, copy the two Neon strings
> from `middleware/.env` first (same shared DB).

- [ ] **Step 4: Commit**

```bash
git add lock-app/prisma/seed-dev.ts lock-app/package.json
git commit -m "Add dev sample-data seed for read surfaces"
```

---

## Task 6: App shell — auth gate, sidebar, property switcher

**Files:**
- Create: `lock-app/src/lib/session-access.ts`
- Create: `lock-app/src/components/Forbidden.tsx`
- Create: `lock-app/src/components/PropertySwitcher.tsx`
- Create: `lock-app/src/components/Sidebar.tsx`
- Create: `lock-app/src/app/(app)/layout.tsx`
- Create: `lock-app/src/app/(app)/alerts/page.tsx`

- [ ] **Step 1: Create `lock-app/src/lib/session-access.ts`**

```ts
/**
 * Page-level access helpers built on the Foundation's session + permissions.
 * `sessionCan` is the non-throwing check for gating nav and rendering <Forbidden/>;
 * `requireUserOrRedirect` bounces anonymous users to /login.
 */
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { hasPermission, type Permission, type ActorPermissions } from "./permissions";
import { visibleProperties, type Property } from "./properties";

export function toActor(u: SessionUser): ActorPermissions {
  return { permissions: u.permissions, scopeType: u.scopeType, propertyIds: u.propertyIds };
}

export function sessionCan(u: SessionUser, permission: Permission, propertyId?: string): boolean {
  return hasPermission(toActor(u), permission, propertyId);
}

export function userProperties(u: SessionUser): Property[] {
  return visibleProperties({ scopeType: u.scopeType, propertyIds: u.propertyIds });
}

export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 2: Create `lock-app/src/components/Forbidden.tsx`**

```tsx
export default function Forbidden({ what }: { what?: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: "#041E42" }}>Not authorized</h1>
      <p>You don&apos;t have permission to view {what ?? "this page"}.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `lock-app/src/components/PropertySwitcher.tsx`**

```tsx
"use client";
import { useRouter, usePathname } from "next/navigation";

interface Props {
  properties: { id: string; name: string }[];
  current?: string;
}

/** Section currently in the URL (rooms|devices|activity), default rooms. */
function sectionOf(pathname: string): string {
  const m = pathname.match(/\/p\/[^/]+\/([^/?]+)/);
  return m?.[1] ?? "rooms";
}

export default function PropertySwitcher({ properties, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const section = sectionOf(pathname);
  return (
    <select
      value={current ?? ""}
      onChange={(e) => router.push(`/p/${e.target.value}/${section}`)}
      style={{ width: "100%", padding: 8, borderRadius: 6, background: "#FDDA24", color: "#041E42", fontWeight: 700, border: "none" }}
    >
      <option value="" disabled>Select property…</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Create `lock-app/src/components/Sidebar.tsx`**

```tsx
import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { sessionCan, userProperties } from "@/lib/session-access";
import PropertySwitcher from "./PropertySwitcher";

/** Nav shell (spec §3): portfolio links on top, property-scoped links below the
 *  switcher, admin links at the bottom. Items are permission-gated. */
export default function Sidebar({ user, currentProperty }: { user: SessionUser; currentProperty?: string }) {
  const props = userProperties(user);
  const p = currentProperty ?? props[0]?.id;
  const navLink = { display: "block", padding: "6px 0", color: "#fff", textDecoration: "none" } as const;
  return (
    <nav style={{ width: 220, minHeight: "100vh", background: "#041E42", color: "#fff", padding: 16, boxSizing: "border-box" }}>
      <div style={{ color: "#FDDA24", fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>

      <Link href="/overview" style={navLink}>Overview</Link>
      <Link href="/alerts" style={navLink}>Alerts</Link>

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      {props.length > 0 && <PropertySwitcher properties={props.map((x) => ({ id: x.id, name: x.name }))} current={p} />}
      <div style={{ marginTop: 8 }}>
        {p && sessionCan(user, "rooms.view", p) && <Link href={`/p/${p}/rooms`} style={navLink}>Rooms</Link>}
        {p && sessionCan(user, "activity.view", p) && <Link href={`/p/${p}/activity`} style={navLink}>Activity Log</Link>}
        {p && sessionCan(user, "devices.view", p) && <Link href={`/p/${p}/devices`} style={navLink}>Devices</Link>}
      </div>

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      {sessionCan(user, "settings.manage") && <Link href="/settings" style={navLink}>Settings</Link>}
      {sessionCan(user, "users.manage") && <Link href="/users" style={navLink}>Users</Link>}

      <div style={{ marginTop: 24, fontSize: 12, color: "#9bb" }}>{user.email}<br />{user.roleName}</div>
    </nav>
  );
}
```

> Note: `/settings` and `/users` are Plan 5; the links render only for admins and
> 404 until then — acceptable for an internal tool. Rooms/Devices/Activity are this plan.

- [ ] **Step 5: Create `lock-app/src/app/(app)/layout.tsx`**

```tsx
import { requireUserOrRedirect } from "@/lib/session-access";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, padding: 24, background: "#fff" }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Create the Alerts stub `lock-app/src/app/(app)/alerts/page.tsx`**

```tsx
export const dynamic = "force-dynamic";

export default function AlertsPage() {
  return (
    <div>
      <h1 style={{ color: "#041E42" }}>Alerts</h1>
      <p>The alerts engine ships in Plan 4 (background jobs). This is a placeholder.</p>
    </div>
  );
}
```

- [ ] **Step 7: Verify typecheck and build**

Run: `cd lock-app && npm run typecheck && npm run build`
Expected: typecheck exits 0; build lists routes incl. `/alerts`.

- [ ] **Step 8: Commit**

```bash
git add lock-app/src/lib/session-access.ts lock-app/src/components lock-app/src/app/\(app\)/layout.tsx lock-app/src/app/\(app\)/alerts
git commit -m "Add app shell: auth gate, sidebar, property switcher, alerts stub"
```

---

## Task 7: Overview page (portfolio cards)

**Files:**
- Create: `lock-app/src/app/(app)/overview/page.tsx`

- [ ] **Step 1: Create `lock-app/src/app/(app)/overview/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; `/overview` listed.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/app/\(app\)/overview
git commit -m "Add Overview portfolio page"
```

---

## Task 8: Rooms page (grid + search/filter)

**Files:**
- Create: `lock-app/src/app/(app)/p/[propertyId]/rooms/page.tsx`

- [ ] **Step 1: Create `lock-app/src/app/(app)/p/[propertyId]/rooms/page.tsx`**

```tsx
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { toRoomTile, filterRoomTiles, type Occupancy, type HealthFilter } from "@/lib/rooms";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = { red: "#c0392b", amber: "#b9770e", green: "#2e7d32" };

export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: { propertyId: string };
  searchParams: { search?: string; occupancy?: string; health?: string };
}) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="rooms for this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const [locks, states, passcodes] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId } }),
    prisma.roomState.findMany({ where: { propertyId } }),
    prisma.passcode.findMany({ where: { propertyId, status: "active", type: "guest" } }),
  ]);
  const stateByRoom = new Map(states.map((s) => [s.roomId, s]));
  const pinByRoom = new Map(passcodes.map((p) => [p.roomId, p.pin]));

  const tiles = filterRoomTiles(
    locks.map((l) => {
      const s = stateByRoom.get(l.roomId);
      return toRoomTile({
        roomId: l.roomId, alias: l.alias, online: l.online, battery: l.battery,
        occupancyStatus: (s?.occupancyStatus as Occupancy) ?? "free",
        guestName: s?.guestName, checkoutDate: s?.checkoutDate, activePin: pinByRoom.get(l.roomId) ?? null,
      });
    }),
    { search: searchParams.search, occupancy: searchParams.occupancy as Occupancy | "all", health: searchParams.health as HealthFilter },
  );

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>{property.name} — Rooms</h1>
      <form method="get" style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input name="search" placeholder="Search room #" defaultValue={searchParams.search ?? ""} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <select name="occupancy" defaultValue={searchParams.occupancy ?? "all"} style={{ padding: 8 }}>
          <option value="all">All occupancy</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="free">Free</option>
        </select>
        <select name="health" defaultValue={searchParams.health ?? "all"} style={{ padding: 8 }}>
          <option value="all">All health</option><option value="online">Online</option><option value="offline">Offline</option><option value="low_battery">Low battery</option>
        </select>
        <button type="submit" style={{ padding: "8px 16px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}>Filter</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <div key={t.roomId} style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ height: 6, background: COLOR[t.occupancyColor] }} />
            <div style={{ padding: 12, color: "#041E42" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{t.label}</strong>
                <span style={{ color: t.online ? "#2e7d32" : "#c0392b" }}>{t.online ? "online" : "offline"}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: t.batteryLow ? "#c0392b" : "#456" }}>
                {t.battery == null ? "battery —" : `battery ${t.battery}%`}{t.batteryLow ? " ⚠" : ""}
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>code {t.maskedCode ?? "—"}</div>
              {t.guestName && <div style={{ fontSize: 12, marginTop: 6, color: "#456" }}>{t.guestName} · out {t.checkoutDate}</div>}
            </div>
          </div>
        ))}
      </div>
      {tiles.length === 0 && <p style={{ marginTop: 16 }}>No rooms match.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; `/p/[propertyId]/rooms` listed as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/rooms"
git commit -m "Add Rooms grid page with search/filter"
```

---

## Task 9: Devices page (lock inventory)

**Files:**
- Create: `lock-app/src/app/(app)/p/[propertyId]/devices/page.tsx`

- [ ] **Step 1: Create `lock-app/src/app/(app)/p/[propertyId]/devices/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; `/p/[propertyId]/devices` listed.

- [ ] **Step 3: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/devices"
git commit -m "Add Devices lock-inventory page"
```

---

## Task 10: Activity Log page + CSV export

**Files:**
- Create: `lock-app/src/app/(app)/p/[propertyId]/activity/page.tsx`
- Create: `lock-app/src/app/(app)/p/[propertyId]/activity/export/route.ts`

- [ ] **Step 1: Create the Activity Log page `lock-app/src/app/(app)/p/[propertyId]/activity/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Create the CSV export route `lock-app/src/app/(app)/p/[propertyId]/activity/export/route.ts`**

```ts
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sessionCan } from "@/lib/session-access";
import { toActivityRow, filterEvents, toCsv } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { propertyId: string } }) {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!sessionCan(user, "activity.export", params.propertyId)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const events = await prisma.eventLog.findMany({ where: { propertyId: params.propertyId }, orderBy: { createdAt: "desc" }, take: 5000 });
  const rows = filterEvents(events.map(toActivityRow), {
    search: url.searchParams.get("search") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
  });

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${params.propertyId}.csv"`,
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; `/p/[propertyId]/activity` and `/p/[propertyId]/activity/export` listed.

- [ ] **Step 4: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/activity"
git commit -m "Add Activity Log page + CSV export route"
```

---

## Task 11: Wire root redirect + final verification

**Files:**
- Modify: `lock-app/src/app/page.tsx`

- [ ] **Step 1: Replace `lock-app/src/app/page.tsx` to send signed-in users to /overview**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSession();
  redirect(user ? "/overview" : "/login");
}
```

- [ ] **Step 2: Run the full test suite**

Run: `cd lock-app && npm test`
Expected: all unit suites pass (permissions, properties, rooms, overview, activity).

- [ ] **Step 3: Run typecheck and build**

Run: `cd lock-app && npm run typecheck && npm run build`
Expected: typecheck exits 0; build lists `/`, `/login`, `/overview`, `/alerts`, `/p/[propertyId]/rooms`, `/p/[propertyId]/devices`, `/p/[propertyId]/activity`, `/p/[propertyId]/activity/export`.

- [ ] **Step 4: (Optional) Manual smoke test against seeded data**

```bash
cd lock-app && npm run dev
```
Then: POST your email to request a link (`curl -X POST localhost:3000/api/auth/request -H 'content-type: application/json' -d '{"email":"bke@rise8companies.com"}'`), copy the `[magic-link]` URL from the dev-server console, open it to set the session cookie, then visit `/overview` → click Lakeland → Rooms (4 tiles, one offline, one low-battery, masked codes), Devices (table), Activity Log (a reveal row tinted amber, a failed row tinted red), and Export CSV.

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/app/page.tsx
git commit -m "Redirect / to /overview when signed in"
```

---

## Self-Review

**Spec coverage (read-surface slice of §3, §4, §5, §7):**
- §3 hybrid nav (portfolio top, property switcher, scoped links, admin bottom), Stayable navy/gold, text-only labels → Task 6 (Sidebar/PropertySwitcher). ✓
- §4.1 Overview cards (online/offline/low-battery/needs-attention, click→Rooms) → Tasks 3, 7. ✓
- §4.3 Rooms grid (occupancy color, health, masked code, guest+checkout, search+filters) → Tasks 2, 8. ✓
- §4.7 Devices inventory (lock id, model, gateway, online, battery, last-seen) → Task 9. ✓
- §4.6 + §5 Activity Log (UTC time, actor/system+source, action, room/lock, detail; free-text search + action filter; CSV export; reveal=amber, failed=red tint) → Tasks 4, 10. ✓
- §7 permission gating per nav item + per page; scope via `visibleProperties`/`sessionCan` → Tasks 1, 6, 8–10. ✓
- **Deferred (correctly, not gaps):** §4.2 Alerts feed (stub only — engine is Plan 4), §4.4 Door detail + code *actions* (Plan 3), §4.5 Passcodes management actions (Plan 3), §4.8 Settings + §4.9 Users/Roles editor (Plan 5), date-range/actor/room dropdown filters beyond search+action (the pure `filterEvents` already supports `from`/`to`/`actor`/`room`; only extra form inputs are deferred), background crons (Plan 4). The `activity.view` rollup-all view is fast-follow; per-property is delivered.

**Placeholder scan:** No "TODO"/"TBD"/"handle edge cases". `/settings` + `/users` nav links are explicitly flagged as Plan-5 routes (admin-only, 404 until built) — a named hand-off, not a hidden gap. The optional dev-server smoke test (Task 11 Step 4) is labeled optional; automated verification is unit tests + build.

**Type consistency:** `Occupancy`/`HealthFilter` (rooms.ts) reused by the Rooms page cast. `ActivityRow`/`RawEvent` (activity.ts) consumed by the page and export route identically (`toActivityRow` → `filterEvents` → `rowTint`/`toCsv`). `SessionUser` → `toActor`/`sessionCan`/`userProperties` (session-access.ts) bridge to `ActorPermissions`/`visibleProperties`. `summarizeProperty(property, LockHealth[])` matches the Overview page's `select { online, battery }`. `LockMap.lockId`/`gatewayId` (BigInt) → `.toString()` at every render/CSV boundary; no BigInt crosses into the client `PropertySwitcher`.

---

## Notes for later plans
- **Plan 3 (Code actions):** Door/Room detail page (`/p/[propertyId]/rooms/[roomId]`), guest-code reveal (logs `code_revealed`)/revoke/manual + **sync-from-lock**; backup-code reveal/rotate (`Passcode.type="backup"`); Passcodes management list (§4.5). Reuse `maskPin`, `sessionCan`, `toActivityRow`.
- **Plan 4 (Background jobs + Alerts):** Vercel Cron health poll → writes `LockMap` health (Overview/Devices/Rooms light up live); occupancy reconcile → `RoomState`; token refresh → `TtlockToken`; Alerts engine replaces the §4.2 stub.
- **Plan 5 (Admin):** Settings (per-property config — may promote the static `properties.ts` catalog to a `Property` table), Users & Roles editor, mapping CRUD, nodemailer wired into the magic-link route.
- **Activity filters fast-follow:** add date-range + actor + room dropdown inputs to the §5 form (the pure `filterEvents` already accepts `from`/`to`/`actor`/`room`).
