# Lock App — Guest Details on Room Detail Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a guest's name, email, phone, room number, and lease start/end on the room detail page, fetched live from Cloudbeds when the room is occupied.

**Architecture:** A pure, unit-tested view-model mapper (`toGuestDetails`) plus two thin read helpers on the existing lock-app `CloudbedsClient`/`CloudbedsRegistry` (`getReservation`, `getGuest`). A server-side loader (`loadGuestDetails`) orchestrates them inside a try/catch so a Cloudbeds failure never breaks the page, returning `GuestDetails | null`. The room detail server component renders a Guest card from the result.

**Tech Stack:** Next.js 14 (App Router, server components), TypeScript, vitest. Cloudbeds PMS v1.2 read endpoints (`getReservation`, `getGuest`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-lock-app-guest-details-design.md`.
- All commands run from `lock-app/`.
- No Prisma migration, no `RoomState` columns, no middleware change.
- No new permission — the card is visible to anyone with `rooms.view` (already required to load the page).
- The live fetch MUST NOT throw to the page: on no key, missing reservation, or API error, the loader returns `null` and the page degrades gracefully.
- Mirror the existing `CloudbedsRegistry` convention: `registry.resolve(propertyId)` returns `CloudbedsClient | null`; a `null` client means no key for that property → return `null` (not an error).
- Keep the two MCP/middleware tool copies untouched — this work is lock-app only.
- Per RISE8 standards: never fabricate guest data; absent fields render as "—".

---

### Task 1: Pure view-model mapper `toGuestDetails`

**Files:**
- Create: `lock-app/src/lib/guest-details.ts`
- Test: `lock-app/src/lib/guest-details.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface GuestDetails { name: string; email: string | null; phone: string | null; roomNumber: string; leaseStart: string | null; leaseEnd: string | null; }`
  - `function toGuestDetails(input: { reservation: { guestName?: string; startDate?: string; endDate?: string; email?: string; phone?: string }; guest: { email?: string; phone?: string; cellPhone?: string } | null; roomNumber: string }): GuestDetails`

- [ ] **Step 1: Write the failing test**

Create `lock-app/src/lib/guest-details.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toGuestDetails } from "./guest-details";

describe("toGuestDetails", () => {
  const base = {
    reservation: { guestName: "Alexander Reyes", startDate: "2026-06-25", endDate: "2026-06-28" },
    guest: { email: "alex@example.com", phone: "+1 863-555-0100" },
    roomNumber: "239",
  };

  it("maps a full reservation + guest into the view model with formatted dates", () => {
    const d = toGuestDetails(base);
    expect(d.name).toBe("Alexander Reyes");
    expect(d.roomNumber).toBe("239");
    expect(d.email).toBe("alex@example.com");
    expect(d.phone).toBe("+1 863-555-0100");
    expect(d.leaseStart).toBe("Jun 25, 2026");
    expect(d.leaseEnd).toBe("Jun 28, 2026");
  });

  it("falls back to 'Guest' when the name is missing", () => {
    const d = toGuestDetails({ ...base, reservation: { startDate: "2026-06-25", endDate: "2026-06-28" } });
    expect(d.name).toBe("Guest");
  });

  it("returns null for missing email/phone (renders as a dash in the UI)", () => {
    const d = toGuestDetails({ reservation: { guestName: "Sam" }, guest: null, roomNumber: "101" });
    expect(d.email).toBeNull();
    expect(d.phone).toBeNull();
    expect(d.leaseStart).toBeNull();
    expect(d.leaseEnd).toBeNull();
  });

  it("prefers reservation contact, then guest email, then guest cellPhone", () => {
    const d = toGuestDetails({
      reservation: { guestName: "Sam", email: "res@example.com" },
      guest: { email: "guest@example.com", cellPhone: "863-555-0199" },
      roomNumber: "101",
    });
    expect(d.email).toBe("res@example.com");
    expect(d.phone).toBe("863-555-0199");
  });

  it("passes a non-ISO date through unchanged rather than mangling it", () => {
    const d = toGuestDetails({ reservation: { guestName: "Sam", startDate: "25 Jun" }, guest: null, roomNumber: "101" });
    expect(d.leaseStart).toBe("25 Jun");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/guest-details.test.ts`
Expected: FAIL — "toGuestDetails is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lock-app/src/lib/guest-details.ts`:

```ts
/**
 * Pure view-model mapper for the room detail page's Guest card. Takes a
 * Cloudbeds reservation (name + lease dates, sometimes contact) and an optional
 * guest record (email/phone) and normalizes them for display. No I/O — the
 * Cloudbeds fetching + try/catch live in guest-loader.ts.
 */
export interface GuestDetails {
  name: string;
  email: string | null;
  phone: string | null;
  roomNumber: string;
  leaseStart: string | null; // formatted, e.g. "Jun 25, 2026"
  leaseEnd: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a Cloudbeds "YYYY-MM-DD" date as "Mon D, YYYY". Non-ISO input passes
 *  through unchanged; empty input → null. Avoids Date parsing (no TZ surprises). */
function formatDate(iso?: string): string | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${MONTHS[mi]} ${Number(m[3])}, ${m[1]}`;
}

export function toGuestDetails(input: {
  reservation: { guestName?: string; startDate?: string; endDate?: string; email?: string; phone?: string };
  guest: { email?: string; phone?: string; cellPhone?: string } | null;
  roomNumber: string;
}): GuestDetails {
  const r = input.reservation;
  const g = input.guest;
  const name = (r.guestName ?? "").trim() || "Guest";
  const email = (r.email ?? g?.email ?? "").trim() || null;
  const phone = (r.phone ?? g?.phone ?? g?.cellPhone ?? "").trim() || null;
  return {
    name,
    email,
    phone,
    roomNumber: input.roomNumber,
    leaseStart: formatDate(r.startDate),
    leaseEnd: formatDate(r.endDate),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/guest-details.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/guest-details.ts lock-app/src/lib/guest-details.test.ts
git commit -m "lock-app: pure toGuestDetails view-model mapper (+tests)"
```

---

### Task 2: Cloudbeds read helpers `getReservation` + `getGuest`

**Files:**
- Modify: `lock-app/src/lib/cloudbeds.ts` (append after the existing `listRooms`)

**Interfaces:**
- Consumes: `CloudbedsRegistry` + `CloudbedsClient` (already in this file); `registry.resolve(propertyId): CloudbedsClient | null`.
- Produces:
  - `interface ReservationDetail { guestName?: string; guestID?: string | number; startDate?: string; endDate?: string; email?: string; phone?: string; [k: string]: unknown }`
  - `interface GuestRecord { email?: string; phone?: string; cellPhone?: string; [k: string]: unknown }`
  - `function getReservation(registry: CloudbedsRegistry, propertyId: string, reservationId: string): Promise<ReservationDetail | null>` — `null` when no key.
  - `function getGuest(registry: CloudbedsRegistry, propertyId: string, guestId: string): Promise<GuestRecord | null>` — `null` when no key.

- [ ] **Step 1: Add the interfaces + helpers**

Append to `lock-app/src/lib/cloudbeds.ts`:

```ts
/** Minimal reservation shape the room detail page needs (name + lease dates;
 *  Cloudbeds sometimes includes primary-guest contact + guestID here). */
export interface ReservationDetail {
  guestName?: string;
  guestID?: string | number;
  startDate?: string;
  endDate?: string;
  email?: string;
  phone?: string;
  [k: string]: unknown;
}

/** Minimal guest record — contact fields only. */
export interface GuestRecord {
  email?: string;
  phone?: string;
  cellPhone?: string;
  [k: string]: unknown;
}

/** Fetch one reservation's detail (name, lease dates, primary guest). Returns
 *  null if no Cloudbeds key is configured for the property. */
export async function getReservation(
  registry: CloudbedsRegistry,
  propertyId: string,
  reservationId: string,
): Promise<ReservationDetail | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;
  const res = await client.get<ReservationDetail>("getReservation", {
    propertyID: propertyId,
    reservationID: reservationId,
  });
  return (res.data ?? {}) as ReservationDetail;
}

/** Fetch one guest's contact record. Returns null if no key for the property. */
export async function getGuest(
  registry: CloudbedsRegistry,
  propertyId: string,
  guestId: string,
): Promise<GuestRecord | null> {
  const client = registry.resolve(propertyId);
  if (!client) return null;
  const res = await client.get<GuestRecord>("getGuest", {
    propertyID: propertyId,
    guestID: guestId,
  });
  return (res.data ?? {}) as GuestRecord;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd lock-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/lib/cloudbeds.ts
git commit -m "lock-app: add getReservation + getGuest read helpers (per-property key, null on no key)"
```

---

### Task 3: Loader + render the Guest card on the room detail page

**Files:**
- Create: `lock-app/src/lib/guest-loader.ts`
- Modify: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `CloudbedsRegistry`, `getReservation`, `getGuest` (Task 2); `toGuestDetails`, `GuestDetails` (Task 1).
- Produces: `function loadGuestDetails(propertyId: string, reservationId: string, roomNumber: string): Promise<GuestDetails | null>` — orchestration wrapped in try/catch; `null` on no key or any failure.

- [ ] **Step 1: Create the loader**

Create `lock-app/src/lib/guest-loader.ts`:

```ts
/**
 * Server-side loader for the room detail Guest card. Orchestrates the live
 * Cloudbeds reads and is wrapped in try/catch so a missing key, missing
 * reservation, or API hiccup NEVER breaks the room page — it just returns null
 * and the page falls back to the cached RoomState summary.
 */
import { CloudbedsRegistry, getReservation, getGuest } from "./cloudbeds";
import { toGuestDetails, type GuestDetails } from "./guest-details";

export async function loadGuestDetails(
  propertyId: string,
  reservationId: string,
  roomNumber: string,
): Promise<GuestDetails | null> {
  try {
    const registry = CloudbedsRegistry.fromEnv();
    const reservation = await getReservation(registry, propertyId, reservationId);
    if (!reservation) return null; // no key for this property

    // Only call getGuest if the reservation didn't already carry contact info.
    let guest = null;
    const hasContact = Boolean(reservation.email || reservation.phone);
    if (!hasContact && reservation.guestID != null) {
      guest = await getGuest(registry, propertyId, String(reservation.guestID));
    }
    return toGuestDetails({ reservation, guest, roomNumber });
  } catch {
    return null; // never break the page on a Cloudbeds failure
  }
}
```

- [ ] **Step 2: Typecheck the loader**

Run: `cd lock-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Load guest details in the page**

In `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx`, add the import near the other `@/lib` imports:

```ts
import { loadGuestDetails } from "@/lib/guest-loader";
```

Then, immediately after the existing `const label = map?.alias?.trim() || roomId;` line, add:

```tsx
  const roomNumber = map?.roomName?.trim() || roomId;
  const guestDetails = state?.currentReservationId
    ? await loadGuestDetails(propertyId, state.currentReservationId, roomNumber)
    : null;
```

- [ ] **Step 4: Render the Guest card**

In the same file, in the RIGHT column (`{/* RIGHT: health + mapping + history */}`), insert this card as the FIRST child of `<div className="col">` (immediately before the existing `Lock health` card):

```tsx
          {state?.currentReservationId && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Guest</div>
              {guestDetails ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>{guestDetails.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "baseline" }}>
                    <span className="lbl">Room</span><span className="mono">{guestDetails.roomNumber}</span>
                    <span className="lbl">Lease start</span><span className="mono">{guestDetails.leaseStart ?? "—"}</span>
                    <span className="lbl">Lease end</span><span className="mono">{guestDetails.leaseEnd ?? "—"}</span>
                    <span className="lbl">Email</span>
                    <span>{guestDetails.email ? <a href={`mailto:${guestDetails.email}`}>{guestDetails.email}</a> : "—"}</span>
                    <span className="lbl">Phone</span>
                    <span>{guestDetails.phone ? <a href={`tel:${guestDetails.phone}`} className="mono">{guestDetails.phone}</a> : "—"}</span>
                  </div>
                </>
              ) : (
                <p className="subtle">Contact details unavailable — check the Cloudbeds key for this property.</p>
              )}
            </div>
          )}
```

- [ ] **Step 5: Typecheck + build**

Run: `cd lock-app && npx tsc --noEmit && npm run build`
Expected: typecheck clean; build succeeds; `/p/[propertyId]/rooms/[roomId]` still compiles.

- [ ] **Step 6: Run the full test suite (no regressions)**

Run: `cd lock-app && npx vitest run`
Expected: all tests pass (existing 100 + 5 new = 105).

- [ ] **Step 7: Commit**

```bash
git add "lock-app/src/lib/guest-loader.ts" "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx"
git commit -m "lock-app: live Guest card (name/email/phone/room/lease dates) on room detail"
```

---

## Manual verification (post-implementation, on the deployed app)

The sandbox can't reach `api.cloudbeds.com`, so verify live after deploy:

1. `cd lock-app && vercel --prod --yes`
2. Open an **occupied** room (e.g. Lakeland Room 239) → the Guest card shows name, room #, lease start/end, and a clickable email + phone.
3. Open a **vacant** room → no Guest card.
4. (Optional) temporarily check a property whose key is absent → card shows the "contact details unavailable" note, page otherwise intact.

## Self-Review

- **Spec coverage:** name/email/phone/room#/lease dates (Task 1 mapper + Task 3 card); live fetch via getReservation+getGuest (Task 2 + loader); room# from `LockMap.roomName` (Task 3 `roomNumber`); visible to `rooms.view` (page already gates on it, no new check); graceful fallback on no-key/error (loader try/catch + the "unavailable" note); no schema/middleware change (none in file list). ✓
- **Placeholder scan:** none — every code step is complete. ✓
- **Type consistency:** `GuestDetails`, `ReservationDetail`, `GuestRecord`, `toGuestDetails`, `getReservation`, `getGuest`, `loadGuestDetails` signatures match across tasks. `reservation.guestID` typed `string | number`, stringified before `getGuest`. ✓
