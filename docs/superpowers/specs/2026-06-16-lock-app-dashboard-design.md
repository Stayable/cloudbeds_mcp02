# Lock-App Dashboard — Design Spec

**Date:** 2026-06-16
**Owner:** RISE8 / Stayable
**Status:** Design approved (brainstorming), pending implementation plan
**Related:** `2026-06-12-ttlock-cloudbeds-middleware-design.md` (the headless middleware this UI sits on top of); `MiddlewareSpec_RISE8_061126.md` (older feature spec — see §11 Corrections)

---

## 1. Purpose & Scope

The **lock-app** is the role-based management UI for Stayable's TTLock ↔ Cloudbeds
door-access system. It is the human-facing companion to the headless **middleware**
(which auto-creates/deletes guest door PINs from Cloudbeds reservation events).

Where the middleware is fully automated, the lock-app is for the ops team to:
- See room occupancy and lock health across all 8 properties at a glance.
- View / reveal / revoke the current guest PIN per door.
- Hold a per-lock **staff backup code** that works during WiFi/power outages.
- Edit the room→lock mapping.
- Read a rich activity/access log of who did what, when.

**In scope (v1):** Overview, Alerts, per-property Rooms / Passcodes / Devices,
Activity Log, Settings, Users; occupancy display, lock health monitoring, guest +
backup codes, reconciliation, audit logging.

**Out of scope (later):** guest PIN delivery (SMS/email — middleware concern),
multi-language, native mobile app, advanced reporting/BI.

### Boundaries

| The lock-app owns | It does NOT own |
|---|---|
| Room→lock mapping (CRUD) | Physical lock hardware / gateways |
| Manual + backup passcode actions | Cloudbeds reservation management |
| Lock health display + alerting | The automated guest-PIN lifecycle (middleware does that) |
| Activity/audit log + viewing | TTLock cloud infrastructure |
| User/role management | Guest communication |

---

## 2. Architecture

- **Stack:** Next.js 14 (App Router), React 18, Prisma 5, Tailwind, deployed to
  Vercel with Root Directory `lock-app/` (its own Vercel project).
- **Auth:** reuse `client-portal`'s magic-link + JWT pattern (`lib/auth.ts`,
  `lib/email.ts`). Internal ops only — no guest access.
- **Database:** the **same Neon Postgres** the middleware uses. The DB is the
  integration point — the lock-app and middleware share *data*, not code (Vercel
  can't import across sibling folders). The lock-app extends the existing Prisma
  schema (`LockMap`, `Passcode`, `EventLog`) with the additions in §8.
- **No Redis / BullMQ.** Background work runs on **Vercel Cron** (see §9). This is
  a deliberate divergence from the older MiddlewareSpec, which assumed a persistent
  worker host — we are serverless.

### Data sources per feature
- **Occupancy** ← Cloudbeds (kept fresh by the webhook the middleware already
  handles + a periodic reconcile job). PMS is the source of truth for occupancy.
- **Current codes** ← our `Passcode` table (the middleware writes these).
- **Lock health** (online/offline, battery, last-seen) ← TTLock, via a polling cron.

---

## 3. Navigation & Layout

**Hybrid navigation, text-only labels (no icons), mobile-responsive, Stayable-branded.**

Left sidebar:
```
STAYABLE                 (gold wordmark)
Overview (all)           ← portfolio: all 8 properties
Alerts (all)             ← global alert feed
─────────────
[Property switcher ▾]    ← scopes everything below
  Rooms
  Passcodes
  Activity Log
  Devices
─────────────
Settings
Users
```

- **Top section (Overview, Alerts)** spans all properties — the "is anything broken
  anywhere?" view for central ops / `super_admin`.
- **Property switcher** scopes the function pages below it — the per-property work
  surface for on-site staff / `property_admin`.

### Branding
- **Navy `#041E42`** — sidebar, headers, body text, button outlines, code panels.
- **Gold `#FDDA24`** — wordmark, active nav item (left bar), property switcher chip,
  section labels on dark panels, primary action buttons.
- **White** — content surfaces. Text on navy is white or gold.
- **Functional status colors** (kept, NOT brand-mapped): occupancy/health use
  red / amber / green so a lockout risk reads as red, not gold. All text is navy
  on white or white on navy for full contrast.

### Mobile rules
- Sidebar collapses to a ☰ menu; property switcher remains accessible.
- Single-column reflow; generous spacing (≈16px outer padding, ≈18px between
  blocks); full-width buttons (≈12px padding, ≈10px apart); dense tables become
  spaced cards.

---

## 4. Screens

### 4.1 Overview (all properties)
Portfolio heartbeat: 8 property cards showing online / offline / low-battery counts
and active-alert count. Click a card → that property's Rooms.

### 4.2 Alerts (all properties)
Global alert feed (see §7), sortable by severity / property / time, with
acknowledge/resolve actions.

### 4.3 Rooms (per property)
Grid of room tiles. Each tile shows three independent signals:
- **Occupancy** (color bar): 🔴 Occupied · 🟠 Reserved · 🟢 Free — from Cloudbeds.
- **Lock health**: online/offline + battery % — from TTLock.
- **Current code**: masked (`••••72`) with a role-gated, logged "reveal".
- Plus guest name + checkout date when occupied.

Top bar: **search** (room #) + filters (status). Mobile: tiles stack to one column.

### 4.4 Door / Room detail
Opened from a tile:
- **Guest code** panel (navy): code (reveal/hide, logged), validity window,
  reservation + guest, status. Actions: **Revoke**, **Generate manual code**,
  **Sync from lock**.
- **Staff backup code** panel (gold dashed, visually distinct — see §6).
- **Code history**: active / expired / revoked with windows and reservations.
- **Battery trend** (7-day).

### 4.5 Passcodes (per property)
All active passcodes for the property in one list (search + filter + CSV export).
Manual generate / revoke from here too.

### 4.6 Activity Log (per property; Overview rolls up all)
See §5.

### 4.7 Devices (per property)
Lock inventory: lock ID, model, gateway, online state, battery, last-seen.
Actions: refresh status, mark lock registered (field task), open mapping.

### 4.8 Settings
Property config (name, real Cloudbeds ID, timezone), lock registration, TTLock
token status (expiry + manual refresh), webhook status (last event received).

### 4.9 Users & Roles
Add/remove users; assign each a role + scope (property / group / all). A **Roles**
sub-section (visible with `roles.manage`) lists roles and their permissions, and lets
admins **create or edit custom roles** by toggling permissions from the §7 catalog —
so new roles are added in the UI, never in code. Seeded roles are flagged `isSystem`
(editable, not deletable).

---

## 5. Activity / Access Log

Every action — by a person **or** the system — is recorded. Captured per entry:

| Field | Notes |
|---|---|
| **Timestamp** | Stored UTC, displayed in the property's timezone |
| **Actor** | User (email + role) for UI actions; or system + **source** (`webhook` / `cron` / `ttlock-push`) for automated ones |
| **Action** | e.g. `guest_code_created`, `guest_code_revoked`, `code_revealed`, `backup_code_revealed`, `backup_code_rotated`, `manual_code_created`, `sync_from_lock`, `lock_offline`, `lock_online`, `low_battery`, `mapping_changed`, `login` |
| **Property / Room / Lock** | scoping |
| **Reservation + guest** | when applicable |
| **Detail** | human-readable, includes **before→after** for changes (e.g. `old ••••11 → new ••••90`, `lock #…388 → #…401`) |
| **Outcome** | `success` / `warning` / `failed` |

UI: **free-text search bar** (across actor, room, lock ID, reservation, detail) +
dropdown filters (action / actor / room / date range) + **CSV export**.
Security-sensitive rows are tinted: code reveals = amber, failures = red.
The same search+filter pattern applies to the Rooms and Passcodes screens.

---

## 6. Staff Backup Code (offline failsafe)

**Problem:** during a WiFi/gateway outage you cannot push or delete codes remotely.
(Battery-powered locks keep working in a power outage, and any code already on a
lock keeps working offline — only remote *management* is lost.)

**Solution:** a standing **per-lock unique** staff code, **pre-provisioned while the
lock is online** so it is already stored on the device when connectivity fails.

- **Granularity:** one unique code per lock (a leak exposes one door; rotate just
  that lock). Staff look it up in the app per room.
- **Lifetime:** long-lived/permanent, with a manual **Rotate** action. (Scheduled
  rotation is a later enhancement.)
- **Distinct from guest codes:** no reservation; **never auto-revoked on checkout**.
  Tagged `type = backup` in the `Passcode` table so the middleware's
  reservation-revoke logic explicitly skips it.
- **Provisioning:** created/rotated via TTLock while the lock is online. If the lock
  is offline, the action queues and the UI warns it will apply when the gateway
  returns.
- **Access:** gated by permissions (§7) — `backup_code.reveal` to view (logged),
  `backup_code.rotate` to rotate. The seeded `attendant` role can reveal; rotate is
  reserved to `manager`/`super_admin` by default, but this is configurable per role.
- **UI:** gold-dashed panel in the door detail, clearly separated from the navy
  guest-code panel, labeled "works offline".

> ⚠️ Open implementation question (§10): whether to provision the backup code as a
> gateway-pushed code (`addType=2`) or a TTLock offline-algorithm passcode
> (`addType=1`) for maximum offline-provisioning resilience. Verify against TTLock
> docs during implementation.

---

## 7. Roles & Permissions (extensible / data-driven)

Roles are **not a hardcoded enum**. They are **records in the database**, each a
named bundle of granular **permissions** plus a **scope**. Admins create and edit
roles in the Users/Settings UI — a new role can be added at runtime without a code
change or a spec revision. The system ships with seeded default roles (below) that
admins can clone, edit, or disable.

### Permission catalog (the granular capabilities a role can grant)
- **Rooms/occupancy:** `rooms.view`
- **Guest codes:** `guest_code.reveal`, `guest_code.revoke`, `guest_code.generate_manual`
- **Backup codes:** `backup_code.reveal`, `backup_code.rotate`
- **Reconciliation:** `lock.sync`
- **Devices:** `devices.view`, `lock.mark_registered`
- **Mapping:** `mapping.edit`
- **Activity log:** `activity.view`, `activity.export`
- **Admin:** `users.manage`, `roles.manage`, `settings.manage`

The UI gates each action on the relevant permission; every code reveal / rotate and
every admin change is written to the Activity Log with actor + timestamp regardless
of role.

### Scope
Each user assignment carries a scope independent of the role's permissions:
- `all` — all 8 properties
- `group` — a named set of properties (e.g. the Jacksonville or Kissimmee cluster)
- `property` — one or more explicitly-assigned properties

A user's effective access = (role's permissions) ∩ (their assigned scope).

### Seeded default roles
| Role (seed) | Permissions | Typical scope |
|---|---|---|
| `super_admin` | all permissions incl. `roles.manage` | `all` |
| `manager` | everything except `roles.manage`/`users.manage` (configurable) | `property` / `group` |
| `attendant` | `rooms.view`, `guest_code.reveal`, `backup_code.reveal`, `lock.sync`, `devices.view`, `activity.view` | `property` |

These are starting points, not fixed — e.g. a future "Maintenance", "Front desk",
"Regional manager", or read-only "Auditor" role is just a new record with the
appropriate permission subset and scope, created in the UI. Only `roles.manage`
holders can define roles.

---

## 8. Data Model Changes (Prisma)

Extends the existing middleware schema (`LockMap`, `Passcode`, `EventLog`).

- **`Passcode`** — add `type` (`guest` | `backup` | `manual`), make
  `reservationId` nullable (backup/manual codes have none).
- **`Lock`** (new, or extend `LockMap`) — `online: Boolean`, `battery: Int`,
  `lastSeen: DateTime`, `model: String?`, `gatewayId: BigInt?`. Battery history
  for the 7-day trend can live in a lightweight `LockHealthSample` table or be
  derived; decide in the plan.
- **`Room` / occupancy** — `occupancyStatus` (`free` | `reserved` | `occupied`),
  `currentReservationId?`, `guestName?`, `checkoutDate?`. Either a new `Room` table
  or occupancy columns alongside the mapping; decide in the plan.
- **`EventLog`** → enriched audit log — add `actorUserId?`, `actorEmail?`,
  `actorRole?`, keep `source`, structured `detail` (incl. before/after).
- **`TtlockToken`** (new) — durable token store (`accessToken`, `refreshToken`,
  `expiresAt`, `uid`) so the 90-day token survives serverless cold starts and the
  refresh cron can manage it. (Middleware currently caches in-process only.)
- **`User`** — email, `roleId`, scope assignment (scope type + property/group
  list), for the lock-app's own auth.
- **`Role`** (new) — `name`, `permissions` (string[] from the §7 catalog; JSON
  column or a `RolePermission` join), `isSystem` (protects seeded roles from
  deletion), `createdAt`. Admins with `roles.manage` create/edit roles at runtime —
  adding a role never requires a code change.
- **`PropertyGroup`** (optional, new) — named property clusters for `group` scope
  (e.g. "Jacksonville", "Kissimmee").

> Schema is shared with the middleware. Any change here that the middleware reads
> (esp. `Passcode.type`) must be coordinated — the middleware's revoke must filter
> `type = guest`.

---

## 9. Background Jobs (Vercel Cron)

- **Lock health poll** — every ~15 min, staggered per property, call TTLock
  `queryOpenState` (or equivalent) per lock; update health columns; fire alerts on
  low battery / offline thresholds.
- **Occupancy reconcile** — periodic Cloudbeds `getReservations` sweep per property
  to self-heal any occupancy state missed by a dropped webhook.
- **TTLock token refresh** — daily check; refresh the stored token ≥7 days before
  its 90-day expiry; alert on failure.

Alert thresholds (low battery <20%, offline >30 min, etc.) and dedup follow the
intent of MiddlewareSpec §8–9, implemented with DB-backed dedup (not Redis).

---

## 10. Reconciliation ("Sync from lock")

TTLock returns `200` even when a command never reached the lock (gateway offline,
BLE timeout). Therefore, after every create/delete — and on-demand via the door
detail's **Sync from lock** button — call TTLock `listKeyboardPwd` for that lock
and compare to our DB. On drift: flag the passcode, log it, and surface a warning
(potential guest lockout). This closes the gap the older spec correctly identified
but the current middleware does not yet implement.

---

## 11. Corrections to the older MiddlewareSpec (`MiddlewareSpec_RISE8_061126.md`)

That spec predates our 2026-06-13 live validation and is wrong in places. Authoritative corrections:

| MiddlewareSpec says | Correct (validated) |
|---|---|
| Cloudbeds HMAC-signs webhooks (`X-Cloudbeds-Signature`) | Cloudbeds does **not** sign webhooks. Auth is a **secret URL token** (`?token=…`), constant-time compared. |
| Webhook payload carries `room_id`, check-in/out times | Payload is **thin** (propertyID + reservationID, no roomID). Handler calls `getReservation` to resolve room(s). |
| Cloudbeds base `hotels.cloudbeds.com/api/v1.1` | `api.cloudbeds.com/api/**v1.2**`. |
| BullMQ + Redis worker | **Vercel serverless** + Vercel Cron; DB-backed idempotency. No Redis. |
| `/v3/keyboardPwd/create` | `/v3/keyboardPwd/**add**` (verify against TTLock docs). |
| Events `checked_in`, `room_moved`, etc. | Cloudbeds emits `created` / `status_changed` / `deleted`; granular transitions inferred from status. **Exact event taxonomy to verify (§12).** |

---

## 12. Open Questions / Assumptions to Verify (do not fabricate)

1. **TTLock backup code type** — `addType=1` (offline algorithm) vs `addType=2`
   (gateway) for true offline-provisioning resilience.
2. **Cloudbeds housekeeping status** — does v1.2 `getRooms` expose clean/dirty so we
   could add a housekeeping axis to the room tile? (Not in v1 unless cheap.)
3. **Cloudbeds webhook event taxonomy** — confirm exact event names and which
   status transitions map to occupancy free/reserved/occupied.
4. **Room assignment shape** — `getReservation` → `data.rooms[].roomID` is assumed
   (extraction isolated in middleware `extractRoomIds`); confirm on a live sample.
5. **TTLock health endpoint** — confirm `queryOpenState` (or the right call) returns
   battery + online for the lock models in use (8072 / C87).

---

## 13. Phasing

- **MVP:** auth + nav shell, Rooms (occupancy + health + code), Door detail (guest
  code reveal/revoke/sync + backup code reveal/rotate), Activity Log (search +
  filter + export), Devices, mapping CRUD, health-poll cron, token store + refresh.
- **Fast-follow:** Alerts engine + email, occupancy reconcile cron, battery trend
  history, scheduled backup-code rotation, CSV imports for bulk mapping.
- **Later:** guest PIN delivery (middleware), reporting/BI, scheduled rotation.
