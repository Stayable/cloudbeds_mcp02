# Lock-App Dashboard — Zone (Building) View

**Date:** 2026-07-03
**Property:** Lakeland (Cloudbeds propertyID `210972`, street code 4645)
**Status:** Design — awaiting BK review

## Problem

The per-property Dashboard renders one flat heatmap of every room ("All rooms").
Lakeland's physical layout is four separate buildings (A, B, C, D — see
`Lakeland Property Map.pdf`). On-site staff think in buildings; a flat grid of
~90 rooms doesn't map to how they walk the property. BK asked for a Dashboard
view that separates rooms per zone.

## Scope (decided)

**Lakeland-only for now.** It is the only property with a map / defined zones.
The mechanism is a per-property config keyed by room number, so any of the other
7 properties can be added later by dropping in its building→room ranges — no code
change beyond the config. We do NOT stub the other 7 (they'd be empty; YAGNI).

## Zones (from the property map)

Buildings are defined by **room-number ranges**, not an explicit room list, so the
view is robust: only rooms that actually exist in the Cloudbeds inventory render,
and closed/reno rooms (e.g. 286, 287) still appear with their normal status color.

| Zone       | Ranges (inclusive)      |
|------------|-------------------------|
| Building A | 100–123, 200–223        |
| Building B | 130–157, 230–257        |
| Building C | 160–171, 260–271        |
| Building D | 180–195, 280–295        |

Room numbers outside every range fall into an **"Other"** bucket, rendered last
and only when non-empty — nothing silently disappears.

## Approach (chosen): URL-param toggle on the existing Dashboard card

The "All rooms" card gains an `All rooms / By zone` toggle implemented as two
`<Link>`s driving a `?view=zone` query param (server-rendered, matches the
existing `?from=` pattern — no client component, no client state). When
`view=zone` **and** the property has a zone config, the card renders one
sub-section per building; otherwise it renders the current flat heatmap.

The toggle only appears for properties that have a zone config (`hasZones`),
so the other 7 properties' dashboards are visually unchanged.

### Alternatives considered
- **Separate `/zones` page + sidebar link** — more room for per-building detail,
  but adds a nav item and a second place rooms live. Rejected as heavier for no
  current need; the toggle keeps rooms in one place.
- **Client-side toggle (useState)** — needs a client component wrapping the card.
  Rejected: the URL-param approach is simpler, shareable, and server-rendered.

## Components

### New: `lock-app/src/lib/zones.ts` (pure, TDD)
```ts
interface Zone { name: string; ranges: [number, number][] }        // e.g. Building A
interface ZonedChips { zoneName: string; chips: RoomChip[]; occupied: number; total: number }

// Config: propertyId -> Zone[]. Lakeland (210972) only, initially.
export function hasZones(propertyId: string): boolean
export function groupChipsByZone(propertyId: string, chips: RoomChip[]): ZonedChips[]
```
- `groupChipsByZone` parses each chip's numeric `label`, assigns it to the first
  zone whose ranges contain it, else the "Other" bucket. Preserves the existing
  chip sort within each zone. `occupied` counts chips whose `status` is an
  occupied state (`ok | warning | issue | occupied-no-lock`); `total` = chips in
  the zone. Zones are returned in config order; "Other" last, omitted if empty.
- `hasZones` returns true only for property IDs present in the config.

### Changed: `lock-app/src/app/(app)/p/[propertyId]/dashboard/page.tsx`
- Read `searchParams.view`. `zoneView = view === "zone" && hasZones(propertyId)`.
- In the "All rooms" card header, when `hasZones(propertyId)`, render the toggle
  (two Links: `?view=` cleared for All rooms, `?view=zone` for By zone; active one
  styled). Preserve any existing `from`/query context if present.
- Body: if `zoneView`, map `groupChipsByZone(...)` to sub-sections — each a small
  header (`Building A` + `n occupied / m`) followed by
  `<RoomHeatmap chips={zone.chips} variant="numbered" propertyId from="dashboard" />`.
  Else the current single `RoomHeatmap`. Legend renders once, below either layout.

No changes to `RoomHeatmap`, `rooms.ts`, chip colors, or the legend.

## Data flow

Unchanged from today: the page builds `roomChips` from LockMap ∪ Cloudbeds rooms
exactly as it does now. The zone view is a **pure regrouping of the same chips** —
no new DB reads, no new Cloudbeds calls, no new env.

## Error handling / edge cases

- No zone config for the property → no toggle, flat view only (all 7 others).
- `view=zone` on a property without zones → falls back to flat view (guarded by
  the `&& hasZones` conjunction).
- A room whose label isn't a pure number, or is out of range → "Other" bucket.
- Empty inventory (no CB key) → same "No rooms found" message as today.

## Testing

`zones.test.ts` (vitest, alongside existing lib tests):
- Lakeland chips distribute into A/B/C/D by number; boundary numbers
  (100, 123, 130, 157, 160, 171, 180, 195, 200, 223, 230, 257, 260, 271, 280, 295).
- A number in a gap (e.g. 125, 159) → "Other".
- Non-numeric label → "Other".
- `occupied`/`total` counts correct for a mixed-status zone.
- "Other" omitted when empty; zones returned in config order.
- `hasZones("210972")` true; `hasZones` for another property id false.

## Out of scope
- Zone maps for the other 7 properties (add config when maps are supplied).
- Editing zones in-app / a zones DB table (static config is sufficient).
- A visual floor-plan rendering of the map image.
