/**
 * Lock discovery sync. Reads every lock from the one TTLock account and files
 * each one per the naming convention (see lock-naming.ts):
 *   - name <ABBR>-<room>  → upsert the room→lock map (also handles a rename)
 *   - non-conforming, mapped   → leave the existing (manual) mapping alone
 *   - non-conforming, unmapped → add to the Unassigned queue
 *
 * Idempotent and safe to re-run. The pure decision lives in classifyLock; this
 * module is the DB/TTLock glue around it.
 */
import { prisma } from "./db";
import { listLocks } from "./ttlock";
import { classifyLock } from "./lock-naming";
import { CloudbedsRegistry } from "./cloudbeds";
import { RoomIndexCache, resolveFromIndex } from "./room-resolver";

export interface SyncSummary {
  total: number;
  mapped: number;
  queued: number;
  kept: number;
  /** Conforming name but room number couldn't be resolved to a Cloudbeds roomID. */
  unresolved: number;
  errors: { lockId: string; error: string }[];
}

/** Lock display name: prefer the operator-set alias, fall back to the model name. */
function lockName(lock: { lockAlias?: string | null; lockName?: string | null }): string {
  return (lock.lockAlias ?? lock.lockName ?? "").trim();
}

async function fetchAllLocks(): Promise<any[]> {
  const all: any[] = [];
  let pageNo = 1;
  for (;;) {
    const { total, list } = await listLocks(pageNo, 100);
    all.push(...list);
    if (list.length === 0 || all.length >= total) break;
    pageNo++;
  }
  return all;
}

export async function syncDiscoveredLocks(): Promise<SyncSummary> {
  const locks = await fetchAllLocks();
  const summary: SyncSummary = { total: locks.length, mapped: 0, queued: 0, kept: 0, unresolved: 0, errors: [] };

  // Preload mapped lockIds so classifyLock can short-circuit manual mappings.
  const maps = await prisma.lockMap.findMany({ select: { lockId: true } });
  const mappedIds = new Set(maps.map((m) => m.lockId.toString()));

  // Per-property room index: resolves a room NUMBER from the lock name to the
  // Cloudbeds roomID the check-in webhook matches on. Fetched at most once per
  // property; null when no Cloudbeds key is configured for that property.
  const roomIndexCache = new RoomIndexCache(CloudbedsRegistry.fromEnv());

  for (const lock of locks) {
    const lockId = BigInt(lock.lockId);
    const name = lockName(lock);
    const battery = typeof lock.electricQuantity === "number" ? lock.electricQuantity : null;
    try {
      const decision = classifyLock(name, mappedIds.has(lockId.toString()));
      if (decision.kind === "map") {
        const { propertyId, room } = decision;
        const index = await roomIndexCache.get(propertyId);
        const roomId = index ? resolveFromIndex(index, room) : null;
        if (!roomId) {
          // Couldn't resolve the room number to a Cloudbeds roomID (no key for the
          // property, or the number is unknown/ambiguous). Do NOT write a
          // room-number mapping — it wouldn't match check-in and would clobber a
          // good one. Leave any existing mapping intact; queue only if unmapped.
          summary.unresolved++;
          if (!mappedIds.has(lockId.toString())) {
            await prisma.unassignedLock.upsert({
              where: { lockId },
              create: { lockId, name, battery },
              update: { name, battery },
            });
            summary.queued++;
          }
          continue;
        }
        await prisma.lockMap.upsert({
          where: { propertyId_roomId: { propertyId, roomId } },
          create: { propertyId, roomId, roomName: room, lockId, alias: name, battery },
          update: { lockId, roomName: room, alias: name, battery },
        });
        // A rename moves the lock: drop any other mapping rows for this lockId
        // (incl. stale room-number rows from older syncs) and clear the queue.
        await prisma.lockMap.deleteMany({
          where: { lockId, NOT: { propertyId, roomId } },
        });
        await prisma.unassignedLock.deleteMany({ where: { lockId } });
        summary.mapped++;
      } else if (decision.kind === "queue") {
        await prisma.unassignedLock.upsert({
          where: { lockId },
          create: { lockId, name, battery },
          update: { name, battery },
        });
        summary.queued++;
      } else {
        summary.kept++;
      }
    } catch (e: any) {
      summary.errors.push({ lockId: lockId.toString(), error: e?.message ?? String(e) });
    }
  }

  return summary;
}
