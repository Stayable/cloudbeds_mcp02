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
  postReservationNote,
  roomNameFor,
} from "./cloudbeds";
import { createPasscode, deletePasscode } from "./ttlock";
import {
  classifyIntent,
  reservationNoteBody,
  type ReservationWebhookPayload,
} from "./reservation-intent";

// Re-exported so existing importers (the webhook route) keep working.
export { classifyIntent };
export type { ReservationWebhookPayload };

export interface SyncResult {
  action: string;
  roomsConsidered: number;
  pinsCreated: number;
  pinsRevoked: number;
  unmappedRooms: string[];
}

/** PIN length for guest door codes (TTLock supports 4–9 digits). */
const PIN_LENGTH = 6;

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
 * Ensure the guest holds a valid PIN on every mapped room of a reservation.
 * Idempotent: a room that already has an active passcode is left untouched.
 */
export async function ensurePasscodes(
  registry: CloudbedsRegistry,
  payload: ReservationWebhookPayload,
): Promise<SyncResult> {
  const propertyId = String(payload.propertyID);
  const reservationId = payload.reservationID;

  const detail = await getReservation(registry, propertyId, reservationId);
  const roomIds = extractRoomIds(detail);
  // Prefer the precise dates from the reservation detail; fall back to payload.
  const { startTs, endTs } = validityWindow(
    detail.startDate ?? payload.startDate,
    detail.endDate ?? payload.endDate,
  );

  const result: SyncResult = {
    action: "ensure",
    roomsConsidered: roomIds.length,
    pinsCreated: 0,
    pinsRevoked: 0,
    unmappedRooms: [],
  };

  for (const roomId of roomIds) {
    const map = await prisma.lockMap.findUnique({
      where: { propertyId_roomId: { propertyId, roomId } },
    });
    if (!map) {
      result.unmappedRooms.push(roomId);
      await prisma.eventLog.create({
        data: {
          source: "webhook",
          event: payload.event,
          propertyId,
          roomId,
          action: "no_lock_mapped",
          detail: { reservationId },
        },
      });
      continue;
    }

    // Idempotency guard: skip if this (reservation, room) already has a live PIN.
    const existing = await prisma.passcode.findFirst({
      where: { reservationId, roomId, status: "active" },
    });
    if (existing) continue;

    const pin = generatePin();
    try {
      const { keyboardPwdId } = await createPasscode({
        lockId: map.lockId,
        passcode: pin,
        startDate: startTs,
        endDate: endTs,
        name: `Res ${reservationId}`,
      });

      await prisma.passcode.create({
        data: {
          reservationId,
          propertyId,
          roomId,
          lockId: map.lockId,
          keyboardPwdId: BigInt(keyboardPwdId),
          pin,
          startTs: BigInt(startTs),
          endTs: BigInt(endTs),
          status: "active",
        },
      });
      result.pinsCreated++;

      await prisma.eventLog.create({
        data: {
          source: "webhook",
          event: payload.event,
          propertyId,
          roomId,
          lockId: map.lockId,
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
            pin,
            roomName: roomNameFor(detail, roomId) ?? roomId,
            startDate: detail.startDate ?? payload.startDate,
            endDate: detail.endDate ?? payload.endDate,
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
      await prisma.eventLog.create({
        data: {
          source: "webhook",
          event: payload.event,
          propertyId,
          roomId,
          lockId: map.lockId,
          action: "passcode_create_failed",
          detail: { reservationId, error: err?.message ?? String(err) },
        },
      });
      throw err; // surface to the route so Cloudbeds retries
    }
  }

  return result;
}

/**
 * Revoke every active PIN for a reservation (checkout / cancel / delete).
 * Idempotent: rows already revoked are skipped; a missing TTLock passcode is
 * treated as already gone.
 */
export async function revokePasscodes(
  reservationId: string,
  event: string,
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
    await deletePasscode({ lockId: pc.lockId, keyboardPwdId: pc.keyboardPwdId });
    await prisma.passcode.update({
      where: { id: pc.id },
      data: { status: "revoked" },
    });
    result.pinsRevoked++;

    await prisma.eventLog.create({
      data: {
        source: "webhook",
        event,
        propertyId: pc.propertyId,
        roomId: pc.roomId,
        lockId: pc.lockId,
        action: "passcode_revoked",
        detail: { reservationId, keyboardPwdId: String(pc.keyboardPwdId) },
      },
    });
  }

  return result;
}
