# Lock-App Property-First Restructure — Design

**Date:** 2026-06-23
**Status:** Approved (verbal, 2026-06-23). Building.
**App:** `lock-app/` (RISE8 / Stayable — role-based TTLock management UI)

## Problem

The current lock-app shell mixes portfolio links, a property switcher, and
property-scoped links in one always-on sidebar, and the landing (`/overview`)
links straight into Rooms. The user wants a **property-first** flow modeled on
the DeviceThread / SmartAccess app (reference screenshots in `lock-app/DeviceThread/`):

1. Start on a **Portfolio** picker → choose a property → land on its **Dashboard**.
2. A property-scoped **sidebar** (Dashboard, Alerts, Rooms, Devices, Activity Log).
3. A **top bar** with a clickable **user profile** menu (notifications, sign out;
   password later) and an in-app **notification bell**.
4. A **Dashboard** modeled on DeviceThread **minus the zones** (no building/room-tile grid).

Plus one bug already fixed: the login email `<input>` inherited white text on a
white field (invisible). Fixed by setting explicit `background`/`color` on the input.

## Decisions (from brainstorming, 2026-06-23)

- **Auth:** email **OTP** (6-digit code), no password. Password possibly added later.
- **Dashboard:** **KPIs + "My Actions" feed** only. Room table deferred.
- **Sidebar:** **flat list**; property name header; `← Portfolio` link. Settings/Users
  pinned at sidebar bottom (permission-gated). Profile menu top-right.
- **Notifications:** **preferences UI + in-app bell**. Prefs save only; real delivery
  wires up with the future Alerts engine (no fake sending).

## Architecture

### 1. Auth → email OTP (replaces magic-link)
- Login page: email → "Send code"; then a 6-digit code entry screen → signed in.
- Reuse `MagicLink` table; add `code String?`. `/api/auth/request` generates a
  6-digit numeric code (15-min expiry), logs it to console (Plan-5 wires real email).
- `/api/auth/verify` becomes a **POST** taking `{email, code}`; matches the newest
  unused/unexpired row for that email, marks it used, mints the existing 8h session
  JWT + session cookie. The verify-by-URL **GET** route is removed.
- OTP gen/verify logic isolated in a pure helper for testing.

### 2. Routing & navigation
- `/` → redirect to `/portfolio`. After OTP verify → `/portfolio`.
- **`/portfolio`** (renamed from `/overview`): property-picker landing. Cards link to
  **`/p/{id}/dashboard`** (was `/rooms`). Top bar only — no property sidebar.
- **`/p/[propertyId]/`** gets a new nested `layout.tsx` rendering the property-scoped
  **Sidebar** + top bar. `(app)/layout.tsx` is reduced to auth + top bar (no sidebar).
- **Sidebar** (flat): `🏠 <Property name>` → Dashboard · Alerts · Rooms · Devices ·
  Activity Log → `← Portfolio`. Settings/Users pinned at bottom (permission-gated).
  The old Overview/Alerts + switcher sidebar is retired.

### 3. Per-property Dashboard — `/p/[propertyId]/dashboard` (new)
- **KPI cards:** Total locks · Online · Offline · Low battery (<20%) · Occupied / Vacant
  (occupancy from `RoomState`).
- **"My Actions" panel:** offline locks; low battery; reserved/occupied rooms with **no
  active guest PIN**; door-left-open (from `EventLog` warning/failed). Each row links to
  the relevant room/device page.
- **No zones / no room grid.** Room table explicitly deferred.
- Derivation in a pure `lib/dashboard.ts` view-model (TDD), mirroring `lib/overview.ts`.

### 4. Top bar (new component; used by both layouts)
- Left: context (property name when scoped). Right: **notification bell** + **profile dropdown**.
- **Profile dropdown:** user name + role · "Notification settings" · "Sign out".
  Password section omitted until password auth is added.

### 5. Notifications — prefs + in-app bell
- **Preferences:** `User.notificationPrefs Json?` — per-type toggles (offline / low
  battery / door-left-open) + email channel. Edited from the profile dropdown. **Saves
  only**; delivery wires up with the Alerts engine.
- **Bell:** badge = count of **unseen** warning/failed `EventLog` rows in the user's
  property scope; dropdown lists recent ones. "Unseen" tracked via
  `User.notificationsSeenAt DateTime?`, updated when the bell opens.
- Unseen-count + recent-list derivation isolated in a pure helper (TDD).

### 6. Data model changes (one `prisma db push` to shared Neon)
- `MagicLink.code String?`
- `User.notificationPrefs Json?`
- `User.notificationsSeenAt DateTime?`

(Neon is reachable from this environment; Prisma CLI reads `.env`.)

### 7. Testing
- vitest, pure libs TDD: `dashboard.ts` (KPI + actions), OTP gen/verify, notification
  bell (unseen count + recent list). Keep the existing suite green.
- `npm run typecheck` + `npm run build` green before done.

## Out of scope (deferred)
- Password auth · real email/SMS delivery · the Alerts engine itself (Plan 4) ·
  dashboard room table · DeviceThread's Issues / Reports / SmartEntertainment /
  SmartRoom / SmartCloud sections.

## Notes
- This **absorbs the OTP/email + profile parts of Plan 5** and adds a Dashboard not
  separately planned — it reshuffles the remaining lock-app plans rather than adding
  wholly new scope.
- The **bell is real but delivery is not** until the Alerts engine exists (by the
  "prefs + bell" choice). No emails go out yet.
