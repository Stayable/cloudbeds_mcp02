/**
 * Reservation → door-PIN reconciliation. This is the core of the middleware:
 * it turns a Cloudbeds reservation event into TTLock passcodes (create on
 * book/check-in, delete on checkout/cancel/delete), keyed by the DB room→lock
 * map, and records every PIN it issues so it can revoke them later.
 *
 * All operations are idempotent — Cloudbeds retries a failed webhook up to 5×,
 * so a redelivery must not mint a second PIN for the same (reservation, room).
 */

import { randomInt } from "node:crypto";
import { prisma } from "./db";
import {
  CloudbedsRegistry,
  extractRoomIds,
  getReservation,
  listCheckedInReservations,
  postReservationNote,
  roomNameFor,
} from "./cloudbeds";
import { createPasscode, deletePasscode, changePasscodePeriod } from "./ttlock";
import {
  classifyIntent,
  reservationNoteBody,
  reconcileDesiredRooms,
  reservationIdOf,
  propertyIdOf,
  isPaidInFull,
  isCheckedIn,
  isCheckout,
  passcodeWindowChanged,
  activeKeyFor,
  type ReservationWebhookPayload,
} from "./reservation-intent";

// Re-exported so existing importers (the webhook route) keep working.
export { classifyIntent, reservationIdOf, propertyIdOf, isCheckout };
export type { ReservationWebhookPayload };

/** Reservation detail shape used by the create/reconcile paths. */
type ReservationDetail = Awaited<ReturnType<typeof getReservation>>;

export interface SyncResult {
  action: string;
  roomsConsidered: number;
  pinsCreated: number;
  pinsRevoked: number;
  unmappedRooms: string[];
}

/** PIN length for guest door codes (TTLock supports 4–9 digits). */
const PIN_LENGTH = 4;

/**
 * Grace minutes for delayed revoke, from the lock-app's Settings → Access timing
 * (shared AppSettings row). 0 = revoke immediately. Fails safe to 0 if unset.
 */
export async function getGraceSettings(): Promise<{ checkoutGraceMinutes: number; transferGraceMinutes: number }> {
  const s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return {
    checkoutGraceMinutes: s?.checkoutGraceMinutes ?? 0,
    transferGraceMinutes: s?.transferGraceMinutes ?? 0,
  };
}

/**
 * Pull a guest's PIN — immediately (graceMinutes ≤ 0) or with HEADROOM: instead of
 * deleting it, shorten its TTLock validity to now+grace and mark it `expiring`, so
 * the guest isn't locked out mid-move while housekeeping/the front desk catches up.
 * Either way the activeKey is nulled (frees the dup-guard slot) and the row stops
 * being the active code. Expiring codes are finalized (hard-deleted) by
 * sweepExpiredPasscodes once their window passes. Returns what it did.
 */
async function revokeOrExpire(
  pc: { id: string; lockId: bigint; keyboardPwdId: bigint; startTs: bigint },
  graceMinutes: number,
): Promise<{ mode: "revoked" | "expiring"; expiresAt: number | null }> {
  if (graceMinutes <= 0) {
    await deletePasscode({ lockId: pc.lockId, keyboardPwdId: pc.keyboardPwdId });
    await prisma.passcode.update({ where: { id: pc.id }, data: { status: "revoked", activeKey: null } });
    return { mode: "revoked", expiresAt: null };
  }
  const expiresAt = Date.now() + graceMinutes * 60_000;
  try {
    await changePasscodePeriod({
      lockId: pc.lockId, keyboardPwdId: pc.keyboardPwdId,
      startDate: Number(pc.startTs), endDate: expiresAt,
    });
  } catch {
    // Best-effort shorten — if the lock is offline we can't change it now. Mark it
    // expiring anyway so the sweep finalizes deletion once it's reachable. (The
    // code's original window is the fallback ceiling.)
  }
  await prisma.passcode.update({
    where: { id: pc.id },
    data: { status: "expiring", endTs: BigInt(expiresAt), activeKey: null },
  });
  return { mode: "expiring", expiresAt };
}

/**
 * Finalize codes whose grace window has passed: hard-delete them from the lock and
 * mark them revoked. Run from the reconcile cron. The code is already dead by its
 * shortened endTs, so a failed delete (offline) just leaves a harmless expired code
 * on the lock — we still mark it revoked in our records.
 */
export async function sweepExpiredPasscodes(): Promise<{ swept: number }> {
  const now = BigInt(Date.now());
  const due = await prisma.passcode.findMany({ where: { status: "expiring", endTs: { lt: now } } });
  let swept = 0;
  for (const pc of due) {
    await deletePasscode({ lockId: pc.lockId, keyboardPwdId: pc.keyboardPwdId }).catch(() => {});
    await prisma.passcode.update({ where: { id: pc.id }, data: { status: "revoked" } });
    swept++;
  }
  return { swept };
}

function generatePin(): string {
  // crypto.randomInt is uniform and avoids Math.random bias for credentials.
  const min = 10 ** (PIN_LENGTH - 1);
  const max = 10 ** PIN_LENGTH;
  return String(randomInt(min, max));
}

/**
 * Convert a Cloudbeds date range (YYYY-MM-DD) into a TTLock validity window in
 * epoch-ms. We open the code at the start of the arrival day and expire it at
 * the end of the departure day (UTC). Florida is UTC-4/5, so this is generous
 * on both ends (the code is live a little early and a little late) — acceptable
 * for v1. Precise property-timezone check-in/out times are a tracked follow-up.
 */
function validityWindow(startDate?: string, endDate?: string): { startTs: number; endTs: number } {
  const start = startDate ? Date.parse(`${startDate}T00:00:00Z`) : NaN;
  const end = endDate ? Date.parse(`${endDate}T23:59:59Z`) : NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`Invalid reservation date range: start=${startDate} end=${endDate}`);
  }
  return { startTs: start, endTs: end };
}

/**
 * Free a reservation's RoomState rows (occupancy → free), EXCEPT rooms in `keep`.
 * Occupancy is tracked by `currentReservationId` independent of whether a PIN was
 * ever created — so a room the guest leaves (or one whose PIN failed to create on
 * an offline lock) doesn't stay "occupied" forever. Returns rooms freed.
 */
async function freeRoomsForReservation(reservationId: string, keep: Set<string> = new Set()): Promise<number> {
  const rows = await prisma.roomState.findMany({
    where: { currentReservationId: reservationId, occupancyStatus: { not: "free" } },
    select: { propertyId: true, roomId: true },
  });
  let freed = 0;
  for (const r of rows) {
    if (keep.has(r.roomId)) continue;
    await prisma.roomState.update({
      where: { propertyId_roomId: { propertyId: r.propertyId, roomId: r.roomId } },
      data: { occupancyStatus: "free", guestName: null, checkoutDate: null, currentReservationId: null },
    });
    freed++;
  }
  return freed;
}

/**
 * Ensure the guest holds a valid PIN on every mapped room of a reservation.
 * Idempotent: a room that already has an active passcode is left untouched.
 */
export async function ensurePasscodes(
  registry: CloudbedsRegistry,
  payload: ReservationWebhookPayload,
): Promise<SyncResult> {
  const propertyId = propertyIdOf(payload);
  const reservationId = reservationIdOf(payload);

  // Trust the webhook payload's status when it already says checked-in (no read lag).
  const payloadCheckedIn = (payload.status ?? "").toLowerCase() === "checked_in";
  let detail = await getReservation(registry, propertyId, reservationId);
  // Otherwise the read can briefly lag the status_changed webhook (returns the
  // pre-change status for a few seconds) — retry until the check-in is visible.
  for (let attempt = 0; attempt < 4 && !payloadCheckedIn && !isCheckedIn(detail); attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    detail = await getReservation(registry, propertyId, reservationId);
  }
  const roomIds = extractRoomIds(detail);
  // RISE8 rule: a code is created only when CHECKED IN and PAID. Check-in is read
  // from the payload status or the reservation (top-level status / guestStatus).
  const checkedIn = payloadCheckedIn || isCheckedIn(detail);
  const paidInFull = isPaidInFull(detail.balance);

  const result: SyncResult = {
    action: "ensure",
    roomsConsidered: roomIds.length,
    pinsCreated: 0,
    pinsRevoked: 0,
    unmappedRooms: [],
  };

  // status_changed fires on many edits; only mint codes once the guest is
  // in-house. If the reservation is NOT checked in but already HAS active codes,
  // the check-in was reversed (e.g. checked_in → confirmed) — pull the codes so
  // the invariant "a live code ⇒ checked-in" holds. (Checkout/cancel/no_show go
  // straight to revoke via classifyIntent; this catches the in-between reversals.)
  if (!checkedIn) {
    // No longer in-house (e.g. check-in reversed): pull any codes AND free any
    // rooms this reservation occupied — including a room whose PIN never created
    // (offline lock), so occupancy doesn't stick.
    const revoked = await revokePasscodes(reservationId, payload.event);
    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId,
        action: "awaiting_checkin",
        detail: { reservationId, status: detail.status ?? null, pinsRevoked: revoked.pinsRevoked },
      },
    });
    return { ...result, pinsRevoked: revoked.pinsRevoked };
  }

  // Prefer the precise dates from the reservation detail; fall back to payload.
  const { startTs, endTs } = validityWindow(
    detail.startDate ?? payload.startDate,
    detail.endDate ?? payload.endDate,
  );

  for (const roomId of roomIds) {
    await createPasscodeForRoom(
      registry, payload, detail,
      { propertyId, reservationId, roomId, paidInFull, startTs, endTs },
      result,
    );
  }

  return result;
}

/**
 * Create (or skip) the guest PIN for ONE room of a reservation. Shared by the
 * check-in (`ensurePasscodes`) and room-change (`reconcilePasscodes`) paths so
 * they can't diverge. Always reflects occupancy first (so the lock-app shows the
 * guest even on an unmapped room); then gates on paid → mapped → idempotency
 * before minting. Throws on a TTLock/DB create failure (→ 500 → Cloudbeds retry).
 */
async function createPasscodeForRoom(
  registry: CloudbedsRegistry,
  payload: ReservationWebhookPayload,
  detail: ReservationDetail,
  args: { propertyId: string; reservationId: string; roomId: string; paidInFull: boolean; startTs: number; endTs: number },
  result: SyncResult,
): Promise<void> {
  const { propertyId, reservationId, roomId, paidInFull, startTs, endTs } = args;

  // Reflect occupancy + guest on the room so the lock-app shows guest details
  // (independent of whether the room is mapped to a lock).
  const occupancy = {
    occupancyStatus: "occupied",
    guestName: detail.guestName ?? null,
    checkoutDate: detail.endDate ?? payload.endDate ?? null,
    currentReservationId: reservationId,
  };
  await prisma.roomState.upsert({
    where: { propertyId_roomId: { propertyId, roomId } },
    create: { propertyId, roomId, ...occupancy },
    update: occupancy,
  });

  // Payment gate: checked-in but a balance remains → no code yet. Logged so a
  // later event (once paid) can re-run and mint it (idempotent).
  if (!paidInFull) {
    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId, roomId,
        action: "awaiting_payment",
        detail: { reservationId, balance: detail.balance ?? null },
      },
    });
    return;
  }

  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) {
    result.unmappedRooms.push(roomId);
    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId, roomId,
        action: "no_lock_mapped",
        detail: { reservationId },
      },
    });
    return;
  }

  // Stay-extension handling: if this (reservation, room) already has a live PIN,
  // keep the SAME digits — transient/long-term guests extend daily/weekly and must
  // NOT get a new code. But if the reservation's dates moved (an extension), push
  // the existing code's validity window out to match so it doesn't expire at the
  // original checkout. A redelivery with an unchanged window is a no-op.
  const existing = await prisma.passcode.findFirst({
    where: { reservationId, roomId, status: "active" },
  });
  if (existing) {
    const windowMoved = passcodeWindowChanged(
      { startTs: Number(existing.startTs), endTs: Number(existing.endTs) },
      { startTs, endTs },
    );
    if (windowMoved) {
      try {
        await changePasscodePeriod({
          lockId: existing.lockId,
          keyboardPwdId: existing.keyboardPwdId,
          startDate: startTs,
          endDate: endTs,
        });
        await prisma.passcode.update({
          where: { id: existing.id },
          data: { startTs: BigInt(startTs), endTs: BigInt(endTs) },
        });
        await prisma.lockMap.updateMany({ where: { propertyId, roomId }, data: { online: true } }).catch(() => {});
        await prisma.eventLog.create({
          data: {
            source: "webhook", event: payload.event, propertyId, roomId, lockId: existing.lockId,
            action: "passcode_period_changed",
            detail: { reservationId, keyboardPwdId: String(existing.keyboardPwdId), startTs, endTs },
          },
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        const offline = /gateway|not connected|-2012/i.test(msg);
        if (offline) {
          await prisma.lockMap.updateMany({ where: { propertyId, roomId }, data: { online: false } }).catch(() => {});
        }
        await prisma.eventLog.create({
          data: {
            source: "webhook", event: payload.event, propertyId, roomId, lockId: existing.lockId,
            action: "passcode_period_change_failed",
            detail: { reservationId, error: msg, offline },
          },
        });
        // Offline lock: don't throw (a 1-min retry won't fix it; the poll cron / next
        // event re-attempts). Other errors are transient → throw so Cloudbeds retries.
        if (offline) return;
        throw err;
      }
    }
    return;
  }

  const pin = generatePin();
  let keyboardPwdId: number | undefined;
  try {
    ({ keyboardPwdId } = await createPasscode({
      lockId: map.lockId,
      passcode: pin,
      startDate: startTs,
      endDate: endTs,
      name: `Res ${reservationId}`,
    }));

    // activeKey is UNIQUE: if a concurrent run (cron vs webhook) already created
    // THE active code for this (reservation, room), this insert throws P2002 and
    // we clean up below — guaranteeing exactly one active guest code per room.
    await prisma.passcode.create({
      data: {
        reservationId, propertyId, roomId,
        lockId: map.lockId,
        keyboardPwdId: BigInt(keyboardPwdId),
        pin,
        startTs: BigInt(startTs),
        endTs: BigInt(endTs),
        status: "active",
        activeKey: activeKeyFor(reservationId, roomId),
      },
    });
    result.pinsCreated++;
    // The lock just accepted a command → it's reachable. Reflect it online so the
    // lock-app heatmap is accurate (clears a prior offline flag).
    await prisma.lockMap.updateMany({ where: { propertyId, roomId }, data: { online: true } }).catch(() => {});

    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId, roomId, lockId: map.lockId,
        action: "passcode_created",
        detail: { reservationId, keyboardPwdId: String(keyboardPwdId) },
      },
    });

    // Surface the code on the Cloudbeds reservation as a note. Best-effort: a
    // note failure must NOT lose the PIN (the row now exists, so a retry would
    // skip creation and never re-post), so we log it and continue.
    try {
      await postReservationNote(
        registry,
        propertyId,
        reservationId,
        reservationNoteBody({
          lockName: map.alias?.trim() || roomNameFor(detail, roomId) || roomId,
          pin,
        }),
      );
      await prisma.eventLog.create({
        data: {
          source: "webhook", event: payload.event, propertyId, roomId, lockId: map.lockId,
          action: "reservation_note_posted",
          detail: { reservationId },
        },
      });
    } catch (noteErr: any) {
      await prisma.eventLog.create({
        data: {
          source: "webhook", event: payload.event, propertyId, roomId, lockId: map.lockId,
          action: "reservation_note_failed",
          detail: { reservationId, error: noteErr?.message ?? String(noteErr) },
        },
      });
    }
  } catch (err: any) {
    // Lost the create race: the unique activeKey rejected this insert because
    // another run already created THE active code for this (reservation, room).
    // Delete the duplicate we just pushed to the lock so it isn't orphaned, then
    // bow out quietly — the winner's code is canonical. (Not a failure.)
    if (err?.code === "P2002") {
      if (keyboardPwdId != null) {
        await deletePasscode({ lockId: map.lockId, keyboardPwdId }).catch(() => {});
      }
      await prisma.eventLog.create({
        data: {
          source: "webhook", event: payload.event, propertyId, roomId, lockId: map.lockId,
          action: "passcode_create_deduped",
          detail: { reservationId, keyboardPwdId: keyboardPwdId != null ? String(keyboardPwdId) : null },
        },
      }).catch(() => {});
      return;
    }
    const msg = err?.message ?? String(err);
    // A gateway/connectivity failure (TTLock -2012) means the lock is unreachable.
    const offline = /gateway|not connected|-2012/i.test(msg);
    const label = map.alias?.trim() || roomNameFor(detail, roomId) || roomId;

    if (offline) {
      // Reflect it offline so the lock-app shows RED (occupied + offline) and lists
      // it under "Needs attention" — instead of a falsely-green lock.
      await prisma.lockMap.updateMany({ where: { propertyId, roomId }, data: { online: false } }).catch(() => {});
    }

    // Surface the failure on the Cloudbeds reservation so front-desk sees it.
    await postReservationNote(
      registry, propertyId, reservationId,
      offline
        ? `⚠ Door code NOT set for ${label} — lock offline (not connected to a gateway). It will be issued automatically once the lock is back online.`
        : `⚠ Door code NOT set for ${label} — ${msg}`,
    ).catch(() => {});

    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId, roomId, lockId: map.lockId,
        action: "passcode_create_failed",
        detail: { reservationId, error: msg, offline },
      },
    });

    // Offline lock: don't throw — a 1-minute Cloudbeds retry won't fix an offline
    // lock (and would re-post the failure note). The poll-reconcile cron / the next
    // check-in event re-attempt the PIN once it's reachable. Other errors (auth/DB)
    // are transient → throw so Cloudbeds retries.
    if (offline) return;
    throw err;
  }
}

/**
 * Revoke every active PIN for a reservation (checkout / cancel / delete).
 * `graceMinutes > 0` (checkout headroom) keeps each code working for that long
 * instead of deleting it now (see revokeOrExpire); 0 = immediate. Idempotent:
 * rows already revoked/expiring are skipped (we only fetch active).
 */
export async function revokePasscodes(
  reservationId: string,
  event: string,
  graceMinutes = 0,
): Promise<SyncResult> {
  const active = await prisma.passcode.findMany({
    where: { reservationId, status: "active" },
  });

  const result: SyncResult = {
    action: "revoke",
    roomsConsidered: active.length,
    pinsCreated: 0,
    pinsRevoked: 0,
    unmappedRooms: [],
  };

  for (const pc of active) {
    const { mode, expiresAt } = await revokeOrExpire(pc, graceMinutes);
    result.pinsRevoked++;

    // Guest is leaving — clear occupancy so the room shows vacant in the lock-app
    // immediately (the code may linger during its grace window, but the room is free).
    await prisma.roomState.upsert({
      where: { propertyId_roomId: { propertyId: pc.propertyId, roomId: pc.roomId } },
      create: { propertyId: pc.propertyId, roomId: pc.roomId, occupancyStatus: "free" },
      update: { occupancyStatus: "free", guestName: null, checkoutDate: null, currentReservationId: null },
    });

    await prisma.eventLog.create({
      data: {
        source: "webhook",
        event,
        propertyId: pc.propertyId,
        roomId: pc.roomId,
        lockId: pc.lockId,
        action: "passcode_revoked",
        detail: { reservationId, keyboardPwdId: String(pc.keyboardPwdId), mode, graceMinutes, expiresAt },
      },
    });
  }

  // Also free any rooms this reservation occupied that had NO active passcode
  // (e.g. a PIN that failed to create on an offline lock) — occupancy is tracked
  // independent of passcodes, so checkout/cancel/un-check-in must clear it too.
  await freeRoomsForReservation(reservationId);

  return result;
}

/**
 * Converge a reservation's PINs onto its CURRENT rooms after a room change
 * (`accommodation_changed` / `accommodation_removed`): revoke PINs on rooms the
 * reservation has left (UNCONDITIONAL — the old code must die the moment the
 * guest leaves), and create PINs on rooms it now occupies (gated: checked-in +
 * paid + mapped). Idempotent + self-healing: a redelivery re-derives the same
 * desired set, finds stale already revoked and desired already created → no-op.
 */
export async function reconcilePasscodes(
  registry: CloudbedsRegistry,
  payload: ReservationWebhookPayload,
): Promise<SyncResult> {
  const propertyId = propertyIdOf(payload);
  const reservationId = reservationIdOf(payload);
  const detail = await getReservation(registry, propertyId, reservationId);
  // Desired rooms = what the reservation reads as, corrected by payload hints
  // (which beat getReservation read-lag).
  const desired = reconcileDesiredRooms(extractRoomIds(detail), payload);
  const desiredSet = new Set(desired);

  const result: SyncResult = {
    action: "reconcile",
    roomsConsidered: desired.length,
    pinsCreated: 0,
    pinsRevoked: 0,
    unmappedRooms: [],
  };

  // 1. Revoke stale — active PINs for this reservation on rooms it no longer
  //    occupies. Runs even if the new room is unmapped (the old code must die).
  //    Room-transfer grace keeps the OLD room's code working a few more minutes
  //    so the guest isn't locked out mid-move.
  const { transferGraceMinutes } = await getGraceSettings();
  const active = await prisma.passcode.findMany({ where: { reservationId, status: "active" } });
  for (const pc of active) {
    if (desiredSet.has(pc.roomId)) continue;
    const { mode, expiresAt } = await revokeOrExpire(pc, transferGraceMinutes);
    result.pinsRevoked++;
    await prisma.roomState.upsert({
      where: { propertyId_roomId: { propertyId: pc.propertyId, roomId: pc.roomId } },
      create: { propertyId: pc.propertyId, roomId: pc.roomId, occupancyStatus: "free" },
      update: { occupancyStatus: "free", guestName: null, checkoutDate: null, currentReservationId: null },
    });
    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId: pc.propertyId, roomId: pc.roomId, lockId: pc.lockId,
        action: "passcode_revoked",
        detail: { reservationId, keyboardPwdId: String(pc.keyboardPwdId), reason: "room_change", mode, graceMinutes: transferGraceMinutes, expiresAt },
      },
    });
  }
  // Free occupancy on rooms the reservation has left — even ones with no passcode.
  await freeRoomsForReservation(reservationId, desiredSet);

  // 2. Create missing — gated. A move of a not-yet-checked-in reservation just
  //    leaves no codes (occupancy still moves once they check in via `ensure`).
  if (!isCheckedIn(detail)) {
    await prisma.eventLog.create({
      data: {
        source: "webhook", event: payload.event, propertyId,
        action: "awaiting_checkin",
        detail: { reservationId, status: detail.status ?? null },
      },
    });
    return result;
  }
  const paidInFull = isPaidInFull(detail.balance);
  const { startTs, endTs } = validityWindow(detail.startDate ?? payload.startDate, detail.endDate ?? payload.endDate);
  for (const roomId of desired) {
    await createPasscodeForRoom(
      registry, payload, detail,
      { propertyId, reservationId, roomId, paidInFull, startTs, endTs },
      result,
    );
  }

  return result;
}

/**
 * Poll-reconcile a property's in-house reservations against their PINs. This is
 * the catch-up for room changes that fire no webhook we receive (a room-only
 * change in some accounts emits nothing subscribed): list the checked-in
 * reservations, and for each — revoke PINs on rooms it has LEFT, create PINs on
 * the rooms it now occupies (gated: paid + mapped). Conservative on purpose: it
 * NEVER touches passcodes for a reservation that isn't in the checked-in set
 * (those are the checkout webhook's job — avoids a partial fetch causing a false
 * revoke). Idempotent: steady state (no moves) issues only the list reads.
 */
export async function reconcileCheckedInReservations(
  registry: CloudbedsRegistry,
  propertyId: string,
): Promise<SyncResult> {
  const reservations = await listCheckedInReservations(registry, propertyId);
  const result: SyncResult = {
    action: "cron_reconcile",
    roomsConsidered: 0,
    pinsCreated: 0,
    pinsRevoked: 0,
    unmappedRooms: [],
  };

  // reservationId → { detail, desired rooms } for every checked-in reservation.
  const byRes = new Map<string, { detail: ReservationDetail; desired: Set<string> }>();
  for (const detail of reservations) {
    const rid = detail.reservationID != null ? String(detail.reservationID) : "";
    if (!rid) continue;
    byRes.set(rid, { detail, desired: new Set(extractRoomIds(detail)) });
  }
  result.roomsConsidered = [...byRes.values()].reduce((n, r) => n + r.desired.size, 0);

  // 1. Revoke stale — only for reservations we KNOW are still checked in but whose
  //    PIN is on a room they no longer occupy (definitive room change). Room-transfer
  //    grace keeps the old room's code working a few more minutes.
  const { transferGraceMinutes } = await getGraceSettings();
  const active = await prisma.passcode.findMany({ where: { propertyId, status: "active" } });
  for (const pc of active) {
    const entry = pc.reservationId ? byRes.get(pc.reservationId) : undefined;
    if (!entry || entry.desired.has(pc.roomId)) continue;
    const { mode, expiresAt } = await revokeOrExpire(pc, transferGraceMinutes);
    result.pinsRevoked++;
    await prisma.roomState.upsert({
      where: { propertyId_roomId: { propertyId: pc.propertyId, roomId: pc.roomId } },
      create: { propertyId: pc.propertyId, roomId: pc.roomId, occupancyStatus: "free" },
      update: { occupancyStatus: "free", guestName: null, checkoutDate: null, currentReservationId: null },
    });
    await prisma.eventLog.create({
      data: {
        source: "cron", event: "cron/reconcile", propertyId: pc.propertyId, roomId: pc.roomId, lockId: pc.lockId,
        action: "passcode_revoked",
        detail: { reservationId: pc.reservationId, keyboardPwdId: String(pc.keyboardPwdId), reason: "room_change_poll", mode, graceMinutes: transferGraceMinutes, expiresAt },
      },
    });
  }
  // Free occupancy on rooms each checked-in reservation has left (incl. passcode-less).
  for (const [rid, { desired }] of byRes) {
    await freeRoomsForReservation(rid, desired);
  }

  // 2. Create missing — for each checked-in reservation's current rooms (gated).
  const pseudo = { event: "cron/reconcile" } as ReservationWebhookPayload;
  for (const [reservationId, { detail, desired }] of byRes) {
    const paidInFull = isPaidInFull(detail.balance);
    let window: { startTs: number; endTs: number };
    try {
      window = validityWindow(detail.startDate, detail.endDate);
    } catch {
      continue; // missing/bad dates on this reservation — skip rather than throw the whole cron
    }
    for (const roomId of desired) {
      await createPasscodeForRoom(
        registry, pseudo, detail,
        { propertyId, reservationId, roomId, paidInFull, startTs: window.startTs, endTs: window.endTs },
        result,
      );
    }
  }

  return result;
}
