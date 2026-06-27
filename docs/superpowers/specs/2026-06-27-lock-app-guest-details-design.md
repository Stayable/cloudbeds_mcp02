# Lock App — Guest Details on the Room Detail Page

**Date:** 2026-06-27
**Status:** Approved (design)
**Scope:** lock-app only. No middleware change, no schema migration.

## Goal

On a room's detail page (`/p/[propertyId]/rooms/[roomId]`), when the room is
occupied, show a **Guest** card with the guest's **name, email, phone**, the
**room number**, and the **lease start / lease end** dates — fetched **live**
from Cloudbeds at page render.

Today the page already shows the guest *name* and *checkout date* from the
locally-cached `RoomState` (written by the middleware at check-in). This feature
adds the contact details (email/phone) and the lease-start date, sourced live so
they're always current, and presents them as one cohesive card.

## Non-goals (YAGNI)

- No change to the rooms **list** page (it keeps showing just the name).
- No new `RoomState` columns, no Prisma migration, no middleware change.
- No caching layer — the live fetch happens on page render only.
- No new permission — visible to anyone with `rooms.view` (see Access below).
- No guest-facing messaging (that's the separate door-code notification work).

## Data sources

| Field | Source | Cloudbeds scope |
|-------|--------|-----------------|
| Guest name | `getReservation` → `guestName` (fallback "Guest") | Reservation: Read |
| Lease start / end | `getReservation` → `startDate` / `endDate` | Reservation: Read |
| Guest email / phone | `getGuest` → email / phone | Guest: Read |
| Room number | `LockMap.roomName` (already loaded on the page) | — |
| Reservation ID | `RoomState.currentReservationId` (already loaded) | — |

The lock-app's `CloudbedsRegistry` (per-property keys) is already in place for
the room dropdown. The keys carry Reservation R/W + Room R + **Guest R** scopes.

## Architecture

Three thin pieces, one of them pure and unit-tested.

### 1. `cloudbeds.ts` — two new read helpers (thin glue, mirror the middleware)

```ts
// getReservation(registry, propertyId, reservationId)
//   -> { guestName?, guestID?, startDate?, endDate? } | null   (null = no key)
// getGuest(registry, propertyId, guestId)
//   -> { email?, phone? } | null                               (null = no key)
```

Both reuse the existing `CloudbedsClient`/`CloudbedsRegistry`. They return
`null` when no key is configured for the property (consistent with `listRooms`),
and throw only on a real API failure (caller catches — see Resilience).

The reservation's primary `guestID` links to the guest record; if
`getReservation` already returns an email/phone for the primary guest, `getGuest`
is skipped (avoids a second call). Otherwise `getGuest(guestID)` fills them in.

### 2. `guest-details.ts` — pure view-model mapper (UNIT-TESTED)

```ts
export interface GuestDetails {
  name: string;          // "Guest" if absent
  email: string | null;
  phone: string | null;
  roomNumber: string;    // from LockMap.roomName, fallback to roomId
  leaseStart: string | null;  // formatted date
  leaseEnd: string | null;
}

export function toGuestDetails(input: {
  reservation: { guestName?: string; startDate?: string; endDate?: string };
  guest: { email?: string; phone?: string } | null;
  roomNumber: string;
}): GuestDetails
```

Pure, no I/O. Handles: missing name → "Guest"; missing email/phone → `null`
(card shows "—"); date formatting; trimming. This is the only unit it's worth
testing in isolation — the rest is glue and rendering.

### 3. Room detail page — server-side load + render

In the existing server component:

1. The page already loads `RoomState` (`state`). If `state?.currentReservationId`
   is present (room occupied), call a small server-side loader that:
   - builds the registry, calls `getReservation`, then `getGuest` if needed,
   - maps via `toGuestDetails` using `map?.roomName ?? roomId` as the room number,
   - returns `GuestDetails | null`.
2. Render a **Guest** card. The existing top-bar "GUEST · name · out date" stays
   (it's the at-a-glance summary, driven by `RoomState`, works even with no key).
   The new card is the detailed surface.

The loader is wrapped so it **never throws to the page** (see Resilience).

## UI

A "Guest" card placed at the top of the right column (or directly under the
header) on the room detail page:

- **Header:** guest name (prominent).
- **Grid (labeled, 2 columns):**
  - Room — `roomNumber`
  - Lease start — `leaseStart`
  - Lease end — `leaseEnd`
  - Email — `mailto:` link, or "—"
  - Phone — `tel:` link, or "—"
- Uses existing design tokens (`.card`, `.eyebrow`/`.lbl`, `.mono` for
  contact/dates). No PIN-style masking — contact info is shown plainly.

Empty/degraded states:
- **Vacant room** (no `currentReservationId`): no guest card (unchanged).
- **No Cloudbeds key for the property:** fall back to the name + checkout already
  in `RoomState`; show a subtle note "Add a Cloudbeds key to show contact details."
- **Live fetch fails / times out:** same graceful fallback — show whatever
  `RoomState` has (name, checkout), no error surfaced to the user beyond a quiet
  note. The codes / lock-health sections are unaffected.

## Access (PII)

Guest email/phone is shown to **anyone with `rooms.view`** (the permission
already required to load the page) — same bar as the guest name shown today.
No new permission, no role-seed change. (Decision: contact info is treated as
normal operational data for staff managing the room.)

## Resilience requirements

- A Cloudbeds outage, a missing/invalid key, or a slow response **must never
  500 or block the room detail page.** The loader catches all errors and returns
  `null`/partial, and the page renders the cached `RoomState` fallback.
- No key for the property is a normal state (not an error) — handled like the
  room dropdown.

## Testing

- **Unit (vitest):** `toGuestDetails` — name fallback, missing email/phone → null,
  date formatting, room-number fallback. (Pure, deterministic.)
- The Cloudbeds glue and the page render are verified by `typecheck` + `build`
  and a manual check against a live occupied room (e.g. Lakeland Room 239),
  since the sandbox can't reach `api.cloudbeds.com`.

## Files touched

- `lock-app/src/lib/cloudbeds.ts` — add `getReservation`, `getGuest`.
- `lock-app/src/lib/guest-details.ts` — new pure mapper.
- `lock-app/src/lib/guest-details.test.ts` — new tests.
- `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx` — load + render the card.
  (A small `lib/guest-loader.ts` may hold the try/catch fetch orchestration to
  keep the page lean; decided at plan time.)
