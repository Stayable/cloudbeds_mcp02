# Stayable Lock Middleware — Feature & Operations Specification

**System:** TTLock OpenAPI ↔ Cloudbeds PMS Integration  
**Scope:** 8 Florida properties · 730 locks (8072 guest rooms, C87 common areas)  
**Purpose:** Replace Device Thread middleware with a fully owned, self-operated backend  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication & Credentials](#2-authentication--credentials)
3. [Cloudbeds Webhook Listener](#3-cloudbeds-webhook-listener)
4. [Job Queue & Idempotency](#4-job-queue--idempotency)
5. [Logic Engine](#5-logic-engine)
6. [TTLock API Operations](#6-ttlock-api-operations)
7. [Room-Lock Mapping Database](#7-room-lock-mapping-database)
8. [Device Health Monitoring](#8-device-health-monitoring)
9. [Alert System](#9-alert-system)
10. [Admin Dashboard](#10-admin-dashboard)
11. [Audit Logging](#11-audit-logging)
12. [Error Handling & Retry](#12-error-handling--retry)
13. [Deployment & Infrastructure](#13-deployment--infrastructure)
14. [Pre-Launch Checklist](#14-pre-launch-checklist)
15. [Known Edge Cases](#15-known-edge-cases)

---

## 1. System Overview

### Data flow

```
Cloudbeds PMS
    │
    │  POST /webhooks/cloudbeds  (HMAC-signed)
    ▼
Webhook Listener  ──►  Job Queue (BullMQ + Redis)
                              │
                              ▼
                        Logic Engine
                         │        │
                   look up      call
                  room-lock    TTLock
                  mapping DB   OpenAPI
                         │        │
                         └──►  Audit Log (PostgreSQL)
                                  │
                              Alert Engine
                                  │
                              Email (SendGrid)
                                  │
                          Admin Dashboard (React)
```

### Boundaries

| What this system owns | What it does NOT own |
|---|---|
| Passcode lifecycle (create, revoke, extend) | Physical lock hardware |
| Room-to-lock mapping | Cloudbeds reservation management |
| Device health state | TTLock cloud infrastructure |
| Alert routing | Gateway hardware and network config |
| Audit trail | Guest communication |

---

## 2. Authentication & Credentials

### TTLock OpenAPI

- **Base URL:** `https://euapi.ttlock.com` (EU) or `https://api.ttlock.com` (US) — confirm region at account creation
- **Auth method:** OAuth2 — client credentials flow
- **Token endpoint:** `POST /oauth2/token`
- **Required credentials:** `clientId`, `clientSecret`, `username`, `password` (the TTLock account email/password hashed with MD5)
- **Token expiry:** 90 days — implement refresh logic; store `access_token` and `expireTime` in the database
- **Token refresh:** Re-authenticate before expiry; build a scheduled job to refresh 7 days before expiry
- **Account:** Use a dedicated operational account (`locks@stayable.com`) — never use a personal account

```
Token generation:
  md5(password) → passwordMd5
  POST /oauth2/token
    clientId, clientSecret, username, passwordMd5, grant_type=password
  → { access_token, expire_in, refresh_token, uid }
```

### Cloudbeds API

- **Base URL:** `https://hotels.cloudbeds.com/api/v1.1`
- **Auth method:** OAuth2 — authorization code flow (for initial setup); then store and refresh `access_token`
- **Webhook signature:** Cloudbeds signs each webhook payload with HMAC-SHA256 using a shared secret — validate every incoming request before processing
- **Webhook secret:** Store in environment variable `CB_WEBHOOK_SECRET` — never hardcode

### Environment variables (minimum required)

```
TTLOCK_CLIENT_ID=
TTLOCK_CLIENT_SECRET=
TTLOCK_USERNAME=
TTLOCK_PASSWORD_MD5=
CB_CLIENT_ID=
CB_CLIENT_SECRET=
CB_WEBHOOK_SECRET=
DB_URL=
REDIS_URL=
SENDGRID_API_KEY=
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=
```

---

## 3. Cloudbeds Webhook Listener

### Endpoint

```
POST /webhooks/cloudbeds
```

### Required behaviour

1. **Validate signature immediately** — compute `HMAC-SHA256(raw_body, CB_WEBHOOK_SECRET)`, compare to `X-Cloudbeds-Signature` header. Return `401` on mismatch. Do not process the event.
2. **Return `200 OK` within 5 seconds** — Cloudbeds marks a webhook as failed if no response is received in time and will retry. Acknowledge first, process async.
3. **Enqueue the raw payload** to the job queue before returning.
4. **Do not execute TTLock calls inside the webhook handler** — all lock operations happen in the worker.

### Events to handle

| Cloudbeds event | Trigger condition | Required action |
|---|---|---|
| `reservation/created` | New reservation saved | Pre-generate passcode if check-in is within 24 hours |
| `reservation/checked_in` | Guest marked checked in | Generate time-scoped passcode; send code to guest if applicable |
| `reservation/checked_out` | Guest marked checked out | Revoke or expire passcode |
| `reservation/room_assigned` | Room added to reservation | Create mapping and generate passcode |
| `reservation/room_moved` | Room change | Revoke old room passcode; generate new passcode for new room |
| `reservation/cancelled` | Reservation cancelled | Revoke any active passcode for this reservation |
| `reservation/modified` | Date or time changed | Adjust passcode validity window to match new check-in/check-out times |

### Webhook registration (one-time setup)

Register your endpoint in Cloudbeds:  
`Settings → Webhooks → Add Webhook → URL: https://yourdomain.com/webhooks/cloudbeds`  
Select all reservation events listed above.

---

## 4. Job Queue & Idempotency

### Queue configuration (BullMQ + Redis)

```
Queue name: lock-operations
Concurrency: 5 workers (safe for TTLock rate limits)
Retry: 3 attempts with exponential backoff (1s, 5s, 30s)
Failed job retention: 7 days (for debugging)
Completed job retention: 24 hours
```

### Idempotency

- **Key format:** `cb:event:{event_id}` stored in Redis with 24-hour TTL
- On job pickup: check Redis for key. If present, skip and mark job complete — Cloudbeds already processed this event.
- On successful completion: write key to Redis.
- This prevents duplicate passcodes when Cloudbeds retries a webhook after a network failure.

### Job payload schema

```json
{
  "event_type": "reservation/checked_in",
  "event_id": "cb_evt_abc123",
  "reservation_id": "RES-00001",
  "property_id": "44199",
  "room_id": "cb_room_101",
  "guest_name": "John Smith",
  "check_in_time": "2025-06-15T15:00:00-05:00",
  "check_out_time": "2025-06-18T11:00:00-05:00",
  "received_at": "2025-06-15T14:55:00Z"
}
```

---

## 5. Logic Engine

The logic engine is the worker that consumes jobs from the queue and executes the appropriate TTLock operation.

### check-in handler

```
1. Look up room_id in mapping DB → get ttlock_lock_id
2. If no mapping found → log error, fire alert, abort
3. Call TTLock: createCustomPasscode(lock_id, passcode, start_time, end_time)
4. Store passcode record in DB (reservation_id, lock_id, passcode, valid_from, valid_to, status=active)
5. Call TTLock: listKeyboardPwd(lock_id) → verify passcode appears on device
6. If verification fails → retry up to 3 times with 10s delay → fire alert if still failing
7. Write audit log: event=passcode_created, outcome=success|failure
```

### check-out handler

```
1. Look up active passcode for reservation_id in DB → get passcode_id, lock_id
2. Call TTLock: deletePasscode(lock_id, keyboard_pwd_id)
3. Call TTLock: listKeyboardPwd(lock_id) → verify passcode is gone
4. Update DB: passcode status=revoked
5. Write audit log: event=passcode_revoked, outcome=success|failure
```

### room-move handler

```
1. Get old room_id → look up old lock_id → get active passcode_id
2. Call TTLock: deletePasscode(old_lock_id, passcode_id)
3. Verify deletion via listKeyboardPwd(old_lock_id)
4. Get new room_id → look up new lock_id
5. Call TTLock: createCustomPasscode(new_lock_id, passcode, check_in_time, check_out_time)
6. Verify creation via listKeyboardPwd(new_lock_id)
7. Update DB: old passcode status=revoked, new passcode record inserted
8. Write audit log: event=room_move, old_lock, new_lock, outcome
```

### reservation-modified handler

```
1. Get active passcode for reservation_id
2. If check_out_time changed:
   a. Call TTLock: modifyPasscodeValidityTime(lock_id, passcode_id, new_end_time)
   b. Verify via listKeyboardPwd
   c. Update DB: valid_to=new_check_out_time
3. If room changed: trigger room-move handler
4. Write audit log
```

### cancellation handler

```
1. Get all active passcodes for reservation_id
2. For each: deletePasscode(lock_id, passcode_id)
3. Verify each deletion
4. Update DB: all passcodes for reservation status=revoked
5. Write audit log
```

---

## 6. TTLock API Operations

### Required endpoints

| Operation | TTLock endpoint | Method |
|---|---|---|
| Get token | `/oauth2/token` | POST |
| List all locks | `/v3/lock/list` | GET |
| Get lock detail | `/v3/lock/detail` | GET |
| Create timed passcode | `/v3/keyboardPwd/create` | POST |
| Delete passcode | `/v3/keyboardPwd/delete` | POST |
| List passcodes on lock | `/v3/keyboardPwd/list` | GET |
| Get lock status (battery, online) | `/v3/lock/queryOpenState` | GET |
| List gateways | `/v3/gateway/list` | GET |

### Passcode creation parameters

```
lockId          — from room-lock mapping DB
keyboardPwdType — 3 (custom passcode, time-scoped)
keyboardPwd     — 6-digit numeric code (generate randomly, check for uniqueness per lock)
startDate       — Unix timestamp milliseconds (check-in time)
endDate         — Unix timestamp milliseconds (check-out time)
date            — current Unix timestamp milliseconds (required by TTLock)
```

### Critical: reconciliation after every write

After every `createPasscode` or `deletePasscode` call, regardless of the HTTP response code:

```
Call: GET /v3/keyboardPwd/list?lockId={lock_id}
Check: does the passcode appear (create) or not appear (delete) in the response?
If mismatch after 3 retries with 30s delay: fire alert, log failure, escalate
```

**Why:** TTLock returns `200 OK` even when the command never reaches the lock (gateway offline, BLE timeout, lock firmware issue). The API response alone cannot be trusted as confirmation of delivery.

### Token refresh logic

```
On startup: load token + expireTime from DB
Before every API call: if (expireTime - now) < 7 days → refresh token
On 401 response: refresh token and retry once
Scheduled job: check token expiry every 24 hours
```

### Rate limits

- TTLock Basic plan: 30,000 calls/month
- TTLock Premium V1: 10,000,000 calls/month — required for production at 730 locks
- Respect 1 call/second per lock to avoid gateway queue overflow

---

## 7. Room-Lock Mapping Database

### Schema

```sql
-- Properties
CREATE TABLE properties (
  id            VARCHAR(10) PRIMARY KEY,  -- Cloudbeds property ID
  name          VARCHAR(100) NOT NULL,
  stayable_id   VARCHAR(10),              -- e.g. 44199, 8700
  timezone      VARCHAR(50) NOT NULL      -- e.g. America/New_York
);

-- Rooms
CREATE TABLE rooms (
  id            VARCHAR(50) PRIMARY KEY,  -- Cloudbeds room ID
  property_id   VARCHAR(10) REFERENCES properties(id),
  room_number   VARCHAR(20) NOT NULL,
  room_type     VARCHAR(50)
);

-- Locks
CREATE TABLE locks (
  id            BIGINT PRIMARY KEY,       -- TTLock lockId
  property_id   VARCHAR(10) REFERENCES properties(id),
  lock_name     VARCHAR(100),
  model         VARCHAR(20),             -- 8072 or C87
  gateway_id    BIGINT,
  battery_level INT,                     -- 0-100
  is_online     BOOLEAN DEFAULT TRUE,
  last_seen     TIMESTAMPTZ
);

-- Room-lock mapping
CREATE TABLE room_lock_map (
  id            SERIAL PRIMARY KEY,
  room_id       VARCHAR(50) REFERENCES rooms(id),
  lock_id       BIGINT REFERENCES locks(id),
  is_active     BOOLEAN DEFAULT TRUE,
  mapped_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, lock_id)
);

-- Passcodes
CREATE TABLE passcodes (
  id                  SERIAL PRIMARY KEY,
  reservation_id      VARCHAR(100) NOT NULL,
  lock_id             BIGINT REFERENCES locks(id),
  room_id             VARCHAR(50) REFERENCES rooms(id),
  keyboard_pwd_id     BIGINT,             -- TTLock's internal passcode ID
  passcode            VARCHAR(10) NOT NULL,
  valid_from          TIMESTAMPTZ NOT NULL,
  valid_to            TIMESTAMPTZ NOT NULL,
  status              VARCHAR(20) DEFAULT 'active',  -- active, revoked, expired
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,
  guest_name          VARCHAR(200)
);

-- Audit log
CREATE TABLE audit_log (
  id              SERIAL PRIMARY KEY,
  event_type      VARCHAR(50) NOT NULL,
  reservation_id  VARCHAR(100),
  lock_id         BIGINT,
  room_id         VARCHAR(50),
  property_id     VARCHAR(10),
  passcode_id     INT REFERENCES passcodes(id),
  outcome         VARCHAR(20) NOT NULL,  -- success, failure, warning
  detail          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- TTLock token store
CREATE TABLE ttlock_tokens (
  id            SERIAL PRIMARY KEY,
  access_token  TEXT NOT NULL,
  expire_time   BIGINT NOT NULL,          -- Unix ms
  uid           BIGINT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_passcodes_reservation ON passcodes(reservation_id);
CREATE INDEX idx_passcodes_lock_status ON passcodes(lock_id, status);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_reservation ON audit_log(reservation_id);
```

### Seed data required at kickoff

Before M1 can be tested end-to-end, the following must be imported:

- All 730 TTLock `lockId` values (from devicethread export or TTLock account)
- All Cloudbeds room IDs per property
- Room-to-lock mapping (which lock is in which room)
- All 8 property IDs and timezones

Format for import CSV:

```
property_id, property_name, room_id, room_number, lock_id, lock_name, model
44199, Davenport, cb_room_101, 101, 987654321, Room 101 Lock, 8072
```

---

## 8. Device Health Monitoring

### Polling schedule

Run a health check worker every **15 minutes** per property (stagger property checks by 2 minutes to avoid API burst):

```
For each lock in locks table:
  GET /v3/lock/queryOpenState?lockId={lock_id}
  Update locks table: battery_level, is_online, last_seen
  If battery_level < 20: fire LOW_BATTERY alert
  If is_online = false AND last_seen > 30 min ago: fire LOCK_OFFLINE alert
```

### Door jam detection

TTLock does not have a polling endpoint for door jam — it fires a push event. Configure TTLock push notification webhook:

```
POST /v3/push/config
  pushUrl: https://yourdomain.com/webhooks/ttlock/events
  events: [LOCK_TAMPER, DOOR_OPEN_TIMEOUT]
```

Handle incoming push events:

```
POST /webhooks/ttlock/events
  If event_type = DOOR_OPEN_TIMEOUT → fire DOOR_JAM alert
  If event_type = LOCK_TAMPER       → fire TAMPER alert
  Write to audit_log
```

### Alert thresholds

| Condition | Threshold | Alert frequency |
|---|---|---|
| Low battery | < 20% | Once per 24 hours per lock |
| Critical battery | < 10% | Every 6 hours per lock |
| Lock offline | > 30 minutes offline | Once per 2 hours per lock |
| Lock back online | After offline alert | Single notification on recovery |
| Door jam | Any DOOR_OPEN_TIMEOUT event | Immediately, every occurrence |
| Tamper | Any LOCK_TAMPER event | Immediately, every occurrence |

---

## 9. Alert System

### Email format

**Subject:** `[Stayable Alert] {SEVERITY} — {lock_name} at {property_name}`  
**From:** `alerts@stayable.com`  
**To:** Operations team distribution list (configurable per property)

**Body fields:**
- Lock name and ID
- Property name
- Room number
- Condition (low battery / offline / door jam / tamper)
- Battery level (if applicable)
- Last seen timestamp (if offline)
- Current active reservation in that room (guest name, check-out time)
- Direct link to lock in admin dashboard

### Alert deduplication

Store last alert time per lock per alert type in Redis:

```
Key: alert:{lock_id}:{alert_type}
TTL: per alert frequency table above
```

Before firing any alert: check Redis. If key exists, suppress. If not, fire and set key.

### Alert types

| Type | Severity | Ops impact |
|---|---|---|
| `LOW_BATTERY` | Warning | Plan battery swap within 48 hours |
| `CRITICAL_BATTERY` | High | Swap batteries before next check-in |
| `LOCK_OFFLINE` | High | Check gateway; guest may not be able to access room |
| `PASSCODE_DELIVERY_FAILED` | Critical | Guest locked out — immediate action required |
| `DOOR_JAM` | High | Door may be propped open or obstructed |
| `TAMPER` | Critical | Possible forced entry attempt |
| `TOKEN_EXPIRY_APPROACHING` | Warning | TTLock OAuth token needs refresh within 7 days |

---

## 10. Admin Dashboard

### Authentication

- JWT-based session auth
- Two roles: `super_admin` (all properties), `property_admin` (assigned properties only)
- Session expiry: 8 hours
- No guest-facing access — internal ops team only

### Pages and features

#### Dashboard home

- Portfolio summary: total locks, online count, offline count, low battery count
- Active alerts across all properties (sortable by severity, property, time)
- Recent access log (last 50 operations across portfolio)
- Per-property status cards (click through to property view)

#### Property view

- All rooms with current lock status (online/offline, battery, active passcode)
- Filter by: status, room type, alert state
- Search by room number or lock ID

#### Lock detail

- Lock name, model, ID, gateway ID
- Battery level with trend (last 7 days)
- Online/offline history
- Current active passcode (masked — show last 2 digits only)
- All passcodes for this lock (history)
- Actions: generate manual passcode, revoke active passcode, refresh status

#### Room-lock mapping

- View all mappings (property → room → lock)
- Add mapping (select room, select lock from unassigned locks list)
- Edit mapping (reassign lock to different room)
- Remove mapping
- Import mapping from CSV (for bulk updates)

#### Access log

- Searchable by: reservation ID, lock ID, room number, property, date range, outcome
- Columns: timestamp, event type, reservation ID, guest name, lock, room, property, outcome, detail
- Export to CSV

#### Passcode management

- View all active passcodes across portfolio (or filter by property)
- Manual passcode generate: select lock, set validity window, generate
- Revoke passcode: confirmation dialog, logs reason
- View expired and revoked passcodes with timestamps

#### Alerts

- All active alerts with acknowledge and resolve actions
- Alert history (last 30 days)
- Alert settings: configure email recipients per property, set custom thresholds

#### Settings

- Property configuration (name, timezone, Cloudbeds property ID)
- Lock registration (add new lock by TTLock lock ID)
- User management (add/remove admins, assign property access)
- TTLock token status (expiry date, manual refresh button)
- Cloudbeds webhook status (last received event timestamp)

---

## 11. Audit Logging

Every operation — regardless of outcome — must be written to `audit_log`. No exceptions.

### Required fields per log entry

```
event_type        — see list below
reservation_id    — Cloudbeds reservation ID (if applicable)
lock_id           — TTLock lock ID
room_id           — Cloudbeds room ID
property_id       — Stayable property ID
passcode_id       — FK to passcodes table (if applicable)
outcome           — success | failure | warning
detail            — human-readable description of what happened or why it failed
created_at        — UTC timestamp
```

### Event types

```
WEBHOOK_RECEIVED          — raw Cloudbeds event received
WEBHOOK_SIGNATURE_FAILED  — invalid HMAC; payload discarded
JOB_ENQUEUED              — event pushed to BullMQ
JOB_DUPLICATE_SKIPPED     — idempotency key found; job skipped
PASSCODE_CREATED          — TTLock createPasscode called successfully
PASSCODE_CREATION_FAILED  — TTLock call failed or reconciliation failed
PASSCODE_VERIFIED         — listKeyboardPwd confirmed code is on device
PASSCODE_VERIFICATION_FAILED — code not found on device after creation
PASSCODE_REVOKED          — TTLock deletePasscode called successfully
PASSCODE_REVOCATION_FAILED — TTLock call failed or reconciliation failed
PASSCODE_EXTENDED         — validity window modified
ROOM_MOVE_COMPLETED       — old passcode revoked, new passcode created
ALERT_FIRED               — alert email sent
ALERT_SUPPRESSED          — alert suppressed by dedup
HEALTH_CHECK_RUN          — scheduled health poll completed
LOCK_STATUS_UPDATED       — battery or online state changed in DB
TOKEN_REFRESHED           — TTLock OAuth token refreshed
```

---

## 12. Error Handling & Retry

### TTLock API failure handling

```
On non-200 response from TTLock:
  Log error with full request/response bodies
  Retry up to 3 times with exponential backoff: 5s, 30s, 120s
  If all retries fail:
    Mark job as failed in BullMQ
    Fire PASSCODE_CREATION_FAILED or PASSCODE_REVOCATION_FAILED alert
    Write to audit_log outcome=failure

On TTLock 401 (token expired):
  Refresh token immediately
  Retry the original request once
  If still 401: fire TOKEN_EXPIRY alert, halt operations, notify ops team
```

### Cloudbeds webhook handler failures

```
If job queue is unavailable when webhook arrives:
  Return 500 to Cloudbeds
  Cloudbeds will retry — do NOT return 200 unless job is enqueued
  Log queue unavailability immediately

If HMAC validation fails:
  Return 401
  Write to audit_log: WEBHOOK_SIGNATURE_FAILED
  Do not process
```

### Passcode delivery failure (reconciliation fails)

```
After 3 reconciliation attempts:
  Mark passcode status=delivery_failed in DB
  Fire PASSCODE_DELIVERY_FAILED alert (Critical severity)
  Include in alert: reservation ID, guest name, check-in time, room number, property
  This is a potential guest lockout — ops team must manually handle
```

### Dead letter queue

Failed jobs that exhaust all retries are moved to a dead letter queue:

```
Queue: lock-operations-failed
Retention: 7 days
Dashboard: show failed job count on admin dashboard home
Action: ops team can re-queue individual jobs from admin dashboard
```

---

## 13. Deployment & Infrastructure

### Minimum production setup

```
Application server   — 1x node (2 CPU, 2GB RAM) — Node.js or Python service
Worker process       — same server or separate (BullMQ workers)
PostgreSQL           — managed instance (Railway, Supabase, RDS) — 10GB storage initial
Redis                — managed instance (Upstash, Railway, ElastiCache) — 256MB
Domain + SSL         — HTTPS required for Cloudbeds webhook registration
```

### Recommended stack

```
Runtime         Node.js 20 LTS or Python 3.12
Framework       Express.js or FastAPI
Queue           BullMQ 5.x + Redis 7.x
ORM / DB        Prisma or Drizzle (Node) / SQLAlchemy (Python) + PostgreSQL 15
Frontend        Next.js 14 (App Router)
Email           SendGrid or Postmark
Hosting         Railway (simplest) or AWS EC2 + RDS + ElastiCache
Containers      Docker + docker-compose for local dev
```

### Environment separation

```
local     — dev machine, uses TTLock sandbox account if available
staging   — dedicated server, uses a test TTLock account with 1-2 real locks
production — all 730 locks, all 8 properties
```

### Health check endpoint

```
GET /health
Response: { status: "ok", db: "ok", redis: "ok", ttlock_token_valid: true, uptime_seconds: 12345 }
```

---

## 14. Pre-Launch Checklist

### From Device Thread (must be secured before any dev begins)

- [ ] Export of all 730 TTLock lock IDs with property and room assignment
- [ ] Export of all gateway IDs and their property locations
- [ ] TTLock sub-account credentials OR device transfer to Stayable's TTLock developer account
- [ ] Cloudbeds room ID to lock ID mapping document
- [ ] Network configuration per property (SSID, VLAN, gateway IP ranges)

### TTLock setup

- [ ] Developer account registered at `open.ttlock.com`
- [ ] Application created (type: Web)
- [ ] Production OAuth credentials (clientId, clientSecret) obtained
- [ ] Dedicated operational account created (`locks@stayable.com`)
- [ ] All 730 locks confirmed accessible under Stayable's account (not Device Thread's)
- [ ] TTLock plan upgraded to Premium V1

### Cloudbeds setup

- [ ] API OAuth app created in Cloudbeds developer portal
- [ ] Webhook endpoint registered and test event received successfully
- [ ] Webhook secret stored in environment config

### Before M1 sign-off

- [ ] End-to-end test with real Cloudbeds reservation: check-in fires passcode creation, confirmed on lock via listKeyboardPwd
- [ ] Check-out revokes passcode, confirmed absent via listKeyboardPwd
- [ ] Room-move test: old passcode revoked, new passcode created on correct lock
- [ ] Duplicate webhook test: send same event twice, confirm only one passcode created
- [ ] Offline lock simulation: confirm alert fires when lock status is offline

### Before production go-live

- [ ] All 730 locks seeded in mapping DB and verified accessible via TTLock API
- [ ] Alert emails verified: send test alert to all recipient addresses
- [ ] Admin dashboard accessible to ops team, roles assigned
- [ ] Monitoring and log aggregation configured
- [ ] Runbook written: what to do when PASSCODE_DELIVERY_FAILED fires

---

## 15. Known Edge Cases

| Scenario | Required handling |
|---|---|
| **TTLock returns success on offline lock** | Reconciliation loop via `listKeyboardPwd` is mandatory after every write — API response alone cannot be trusted |
| **Cloudbeds webhook fires twice** | Redis idempotency key keyed to `event_id` — second job is skipped silently |
| **Early check-in** | Watch for `reservation/modified` with earlier check-in time; adjust passcode `start_date` or pre-create if within 24 hours |
| **Late check-out** | Watch for `reservation/modified` with later check-out time; extend passcode `end_date` via modify endpoint |
| **Group booking (multiple rooms, one reservation)** | One reservation_id can map to multiple room_ids — logic engine must create one passcode per lock, not one total |
| **Room move while guest is checked in** | Old passcode must be revoked and new one created atomically — use a DB transaction; if new creation fails, do not revoke old until resolved |
| **Lock goes offline mid-stay** | Guest still has passcode stored locally on lock — lock opens offline. No action required unless battery is also dead. Alert ops team. |
| **Gateway offline** | Passcode commands queue at TTLock cloud — they deliver when gateway reconnects. Monitor for delivery via reconciliation after gateway comes back online. |
| **TTLock OAuth token expires during an operation** | Refresh token, retry the operation once. If token refresh fails, halt all lock operations and alert immediately. |
| **Duplicate passcode on same lock** | TTLock allows multiple active passcodes per lock. Always look up and revoke ALL passcodes for a reservation before creating a new one (room move, extension) to avoid accumulation. |
| **Reservation for a room with no mapping** | Log `NO_MAPPING_FOUND` error, fire alert, skip passcode creation. Ops team must add mapping manually before guest arrives. |
| **8 properties on separate Cloudbeds accounts** | Webhook listener must identify which property the event belongs to and route to the correct room-lock lookup. Property ID must be in every job payload. |

---

*Last updated: June 12, 2026*  
*Owner: Stayable Asset Management*
