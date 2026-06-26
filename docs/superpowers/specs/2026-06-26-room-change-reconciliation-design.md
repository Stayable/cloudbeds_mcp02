# Room-Change Reconciliation — Design Spec

**Date:** 2026-06-26
**Component:** `middleware/` (TTLock ↔ Cloudbeds webhook service)
**Status:** Approved — ready for implementation plan

## Problem

When a guest is moved to a different room mid-stay, the middleware leaves the
**old room's PIN live** until checkout. Today `revokePasscodes` only fires on
checkout / cancel / delete of the whole reservation; `ensurePasscodes` creates a
PIN for whatever rooms are *currently* assigned but never removes a PIN from a
room the reservation has left. Result: after a move, anyone holding the old code
can still open the vacated room.

Root cause is two-fold:

1. **No trigger.** The middleware subscribes only to `reservation/status_changed`
   and `reservation/deleted`. A room reassignment does **not** change reservation
   status, so no event reaches us.
2. **No removal logic.** Even if an event arrived, the sync layer has no path that
   revokes a PIN on a room a still-active reservation no longer occupies.

## Confirmed facts

- Stayable performs room changes as a **reassignment within the same
  reservation** (reservation ID unchanged; assigned room A → B).
- Cloudbeds emits a dedicated event:
  **`reservation/accommodation_changed`** — payload carries `reservationId`,
  `roomId` (new), `roomIdPrev` (old), `subReservationId`.
- Related events: **`reservation/accommodation_removed`** (a room dropped from a
  multi-room reservation; payload `reservationId`, `roomId`, `subReservationId`)
  and `reservation/accommodation_type_changed` (room *type* only — not handled in
  v1; a type change without a unit change does not move the guest's door).
- These newer events use `reservationId` / `roomId` casing, whereas
  `status_changed` uses `reservationID` / `propertyID`. The payload parser must
  accept **both casings**.

## Current flow (unchanged baseline)

This is the system as it exists today, restated so this spec stands on its own.
The room-change work *adds* to it; none of the paths below change. Full original
design: `2026-06-12-ttlock-cloudbeds-middleware-design.md`.

### Webhook receiver — `POST /api/cloudbeds-webhook?token=<WEBHOOK_SECRET>`

One endpoint, registered in all 8 Cloudbeds accounts. Steps:

1. **Auth.** Verify the secret URL token (constant-time). Bad/missing → `401`.
   (Cloudbeds does not sign webhooks, so the token is the only gate.)
2. **Parse.** Malformed JSON → `400`. Missing `event` / `propertyID` /
   `reservationID` → `400`. Neither is retryable.
3. **Classify** via `classifyIntent` (below).
4. **Act.** `ensure` → `ensurePasscodes`; `revoke` → `revokePasscodes`;
   `ignore` → log `ignored`, return `200`.
5. **Response contract.** Return `2XX` on anything handled or non-retryable;
   return `500` only on a transient failure (Cloudbeds/TTLock/DB hiccup) so
   Cloudbeds retries (it retries 5× at 1-min intervals). All work is idempotent,
   so a retry is safe.

### `classifyIntent(payload)` → `ensure | revoke | ignore`

- event name includes `deleted` → **revoke**
- `status` ∈ {`canceled`, `cancelled`, `checked_out`, `no_show`} → **revoke**
- event name includes `status_changed` → **ensure**
- everything else (e.g. `created`) → **ignore** (do nothing until a status change)

The thin `status_changed` payload's top-level `status` stays `confirmed` even on
check-in (check-in is tracked per-guest), so we can't decide create-vs-not from
the payload — every `status_changed` routes to `ensure`, which re-fetches the
reservation and applies the real gate.

### Create path — `ensurePasscodes(registry, payload)` (trigger: `status_changed`)

1. `getReservation(propertyId, reservationId)`. If the payload doesn't already
   say `checked_in`, the read can briefly lag the webhook — retry up to 4× (3s
   apart) until check-in is visible.
2. `extractRoomIds(detail)` → assigned roomIDs (reads `assigned[]`,
   `guestList[].rooms[]`, `rooms[]`; de-duped).
3. **Gate.** `checkedIn` = payload status or reservation status/guestStatus ===
   `checked_in`; `paidInFull` = balance ≤ 0 (unknown/unparseable balance fails
   closed → treated as *not* paid).
4. If **not checked-in** → log `awaiting_checkin`, return (no codes).
5. Compute validity window: open at arrival-day 00:00 UTC, expire at
   departure-day 23:59 UTC (generous; precise property-TZ times are a follow-up).
6. For each assigned room:
   - Upsert `RoomState` → occupied (guestName, checkoutDate,
     currentReservationId) so the lock-app shows the guest, mapped or not.
   - If **not paid** → log `awaiting_payment`, continue (a later paid event
     re-runs and mints it).
   - Look up `LockMap (propertyId, roomId)`. If **unmapped** → log
     `no_lock_mapped`, continue.
   - **Idempotency:** if an active `Passcode` already exists for
     `(reservationId, roomId)` → skip.
   - Generate a 6-digit PIN (`crypto.randomInt`), `createPasscode` on TTLock,
     store the `Passcode` row (incl. `keyboardPwdId` for later revoke), log
     `passcode_created`.
   - **Best-effort note:** post `LL-<room>-<PIN>` onto the reservation
     (`reservationNoteBody`). A note failure logs `reservation_note_failed` but
     does **not** lose the PIN (the row exists; a retry would skip creation).
   - On a TTLock/DB create failure → log `passcode_create_failed` and throw
     (→ `500` → Cloudbeds retries).

### Revoke path — `revokePasscodes(reservationId, event)` (trigger: `deleted`, or status `checked_out` / `canceled` / `no_show`)

1. Find all active `Passcode` rows for the reservation.
2. For each: `deletePasscode` on TTLock (a missing TTLock passcode is treated as
   already gone), mark the row `revoked`, free its `RoomState` (occupancyStatus →
   free; clear guest/checkout/currentReservationId), log `passcode_revoked`.

Idempotent: already-revoked rows are skipped.

### Intent map (after this change)

| Cloudbeds event | Condition | Intent | Effect |
|---|---|---|---|
| `reservation/created` | — | ignore | nothing (wait for check-in) |
| `reservation/status_changed` | status → `checked_in` + paid | ensure | create PIN(s) on mapped rooms |
| `reservation/status_changed` | status `checked_out`/`canceled`/`no_show` | revoke | delete all PINs for the reservation |
| `reservation/deleted` | — | revoke | delete all PINs for the reservation |
| **`reservation/accommodation_changed`** | — | **reconcile** | revoke old room's PIN, create new room's PIN |
| **`reservation/accommodation_removed`** | — | **reconcile** | revoke the removed room's PIN |
| `reservation/accommodation_type_changed` | — | ignore (v1) | nothing (no unit move) |

## Chosen approach — Reconciliation (Approach B)

Treat any room-affecting event as "make TTLock reality match the reservation's
current room assignment." Rather than special-casing each event, fetch the
reservation, compute the **desired** set of assigned rooms, and converge:

- revoke active PINs for rooms no longer in the desired set,
- create PINs for desired rooms that lack one (under the existing gate).

This is idempotent, self-healing (corrects drift), and handles multi-room and
move-then-move-back without per-event branches. The payload's `roomId` /
`roomIdPrev` are used as **hints** to correct for `getReservation` read-lag.

Rejected alternative — *Targeted* (revoke `roomIdPrev`, create `roomId` straight
from the payload): simpler but trusts the payload field absolutely, does not
self-heal, and needs separate handling for `accommodation_removed`.

## Flow

1. **Webhook subscription.** Register `reservation/accommodation_changed` and
   `reservation/accommodation_removed` on every property's webhook, in addition
   to the existing `status_changed` and `deleted`. → same endpoint
   `/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>`.

2. **`classifyIntent`.** Add a `"reconcile"` intent. Events whose name includes
   `accommodation_changed` or `accommodation_removed` → `"reconcile"`.
   (`deleted` → revoke; cancel/checked_out/no_show status → revoke;
   `status_changed` → ensure; everything else → ignore — unchanged.)

3. **`reconcilePasscodes(registry, payload)`** (new, in `passcode-sync.ts`):
   1. `getReservation(propertyId, reservationId)` → reservation detail.
   2. Compute `desiredRoomIds = extractRoomIds(detail)`. Correct for read-lag
      using the payload: if `payload.roomId` is present, ensure it is included;
      if `payload.roomIdPrev` (or the removed `roomId` for
      `accommodation_removed`) is present, ensure it is excluded.
   3. **Revoke stale — unconditional.** For each active `Passcode` row for this
      `reservationId` whose `roomId ∉ desiredRoomIds`: delete the TTLock PIN
      (`deletePasscode`), mark the row `revoked`, free its `RoomState`
      (occupancyStatus → free, clear guest/checkout/currentReservationId), and
      log `passcode_revoked`. This runs even if the new room is unmapped — the
      old code must die the moment the guest leaves the room.
   4. **Create missing — gated.** For each room in `desiredRoomIds`, run the
      existing create path (checked-in + paid-in-full + mapped + idempotency
      guard), generate a **fresh** PIN, write the `Passcode` row, set `RoomState`
      occupied, and post the `LL-<room>-<PIN>` reservation note. Reuse the create
      loop currently inside `ensurePasscodes` (extract a shared helper so the two
      paths cannot diverge).

4. **Revoke path unchanged.** Checkout / cancel / delete still revoke *all*
   active PINs for the reservation via `revokePasscodes`.

## Design decisions

- **Fresh PIN on the new room** — the guest does not keep their old digits. The
  new `LL-<room>-<PIN>` note communicates the new code. Simpler than re-using a
  PIN across two physical locks; revisit only if guest-experience requires it.
- **Revoke is unconditional; create is gated.** Leaving a room always kills its
  code; gaining a room still requires checked-in + paid + mapped.

## Edge cases

- **New room not yet mapped to a lock.** Old PIN is still revoked. The desired
  new room logs `no_lock_mapped` and the guest has *no* working code → must
  surface as an operator alert, not fail silently. (Alert delivery is the
  lock-app alerts engine, tracked separately; v1 at minimum logs it distinctly.)
- **`getReservation` read-lag.** The fetch may briefly return the pre-move room.
  Payload `roomId`/`roomIdPrev` hints (step 3.2) prevent us from both failing to
  revoke the old room and failing to create the new one. Retain the existing
  short retry-until-visible loop where it helps.
- **Multi-room reservation, one room swapped.** Reconciliation touches only the
  changed room; untouched rooms keep their PINs (idempotency guard skips them).
- **Move then move back within the validity window.** Reconciliation re-creates
  the PIN for the re-occupied room (a fresh PIN, since the prior one was revoked).
- **Payload casing.** Parser accepts `reservationId`/`reservationID`,
  `propertyId`/`propertyID`, and reads `roomId`/`roomIdPrev`.
- **Cloudbeds 5× retry.** All steps idempotent: re-delivery re-derives the same
  desired set, finds stale already revoked and desired already created → no-op.

## Out of scope (v1)

- `accommodation_type_changed` handling (no unit move → no door change).
- Re-using the guest's PIN across the move.
- Property-timezone-precise validity windows (existing UTC day-bounds retained).

## Testing

- **Unit (vitest, pure logic):** extend `reservation-intent.test.ts` —
  `classifyIntent` returns `"reconcile"` for `accommodation_changed` /
  `accommodation_removed`; payload-casing parser reads both shapes; desired-set
  correction includes `roomId` and excludes `roomIdPrev`.
- **Reconcile logic:** test `reconcilePasscodes` desired-vs-actual diff with a
  mocked Cloudbeds/TTLock/prisma — asserts stale revoked, missing created,
  unchanged skipped, unmapped-new logged + old still revoked.
- **Live trial (Lakeland 210972):** recreate a test reservation, check in + zero
  balance → PIN on room A; reassign A → B in Cloudbeds → confirm old PIN revoked
  on lock A and new PIN created on lock B with a fresh `LL-<B>-<PIN>` note. (Test
  reservation to be recreated by BK.)

## Dependencies / sequencing

- Independent of the room-name → Cloudbeds-roomID resolver (TODO #1), but they
  share the principle that LockMap is keyed by the **real Cloudbeds roomID**. The
  live trial for this needs at least two mapped locks at Lakeland (rooms A and B).
- Requires re-registering each property's webhook with the two added events.
