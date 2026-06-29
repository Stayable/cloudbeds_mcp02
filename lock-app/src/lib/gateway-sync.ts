/**
 * Gateway discovery sync. Reads every gateway from the one TTLock account, links
 * the locks each one serves, and infers the gateway's property from those locks.
 * Runs AFTER the lock discovery sync (so LockMap/UnassignedLock are fresh) and is
 * folded into the same "Sync" action — see unassigned/actions.ts.
 *
 * We iterate gateways (few) and list each gateway's locks, rather than asking per
 * lock (~1,450) — far fewer TTLock calls. Idempotent and safe to re-run.
 */
import { prisma } from "./db";
import { listGateways, listLocksForGateway } from "./ttlock";
import { propertyOfUnassignedName } from "./lock-naming";
import { inferGatewayProperty } from "./gateway-view";

export interface GatewaySyncSummary {
  total: number;
  updated: number;
  removed: number;
  lockLinks: number;
  errors: { gatewayId: string; error: string }[];
}

async function fetchAll(fetchPage: (pageNo: number) => Promise<{ total: number; list: any[] }>): Promise<any[]> {
  const all: any[] = [];
  let pageNo = 1;
  for (;;) {
    const { total, list } = await fetchPage(pageNo);
    all.push(...list);
    if (list.length === 0 || all.length >= total) break;
    pageNo++;
  }
  return all;
}

function isOnline(gw: any): boolean {
  return gw.isOnline === 1 || gw.isOnline === true;
}

export async function syncGateways(): Promise<GatewaySyncSummary> {
  const gateways = await fetchAll((p) => listGateways(p, 100));
  const summary: GatewaySyncSummary = { total: gateways.length, updated: 0, removed: 0, lockLinks: 0, errors: [] };

  // lockId(string) -> propertyId, from mapped locks then the unassigned pool name.
  const lockProp = new Map<string, string>();
  for (const m of await prisma.lockMap.findMany({ select: { lockId: true, propertyId: true } })) {
    lockProp.set(m.lockId.toString(), m.propertyId);
  }
  for (const u of await prisma.unassignedLock.findMany({ select: { lockId: true, name: true } })) {
    const p = propertyOfUnassignedName(u.name);
    if (p && !lockProp.has(u.lockId.toString())) lockProp.set(u.lockId.toString(), p);
  }

  const seen = new Set<string>();   // gatewayIds present in TTLock (for stale cleanup)
  const claimed = new Set<string>(); // lockIds already given a primary gateway this run

  for (const gw of gateways) {
    try {
      const gatewayId = BigInt(gw.gatewayId);
      seen.add(gatewayId.toString());

      const locks = await fetchAll((p) => listLocksForGateway(gatewayId, p, 100));
      const servedLockIds = locks.map((l) => String(l.lockId));
      const propertyId = inferGatewayProperty(servedLockIds.map((id) => lockProp.get(id) ?? null));

      const name = String(gw.gatewayName ?? "").trim() || `Gateway ${gw.gatewayId}`;
      const online = isOnline(gw);
      const lockCount = typeof gw.lockNum === "number" ? gw.lockNum : servedLockIds.length;
      const networkName = gw.networkName ? String(gw.networkName) : null;

      await prisma.gateway.upsert({
        where: { gatewayId },
        create: { gatewayId, name, propertyId, online, lockCount, networkName, lastSeen: online ? new Date() : null },
        update: { name, propertyId, online, lockCount, networkName, ...(online ? { lastSeen: new Date() } : {}) },
      });
      summary.updated++;

      // Link each served lock to this gateway (primary = first gateway to claim it).
      for (const id of servedLockIds) {
        if (claimed.has(id)) continue;
        claimed.add(id);
        const lockId = BigInt(id);
        const r = await prisma.lockMap.updateMany({ where: { lockId }, data: { gatewayId } });
        if (r.count === 0) await prisma.unassignedLock.updateMany({ where: { lockId }, data: { gatewayId } });
        summary.lockLinks++;
      }
    } catch (e: any) {
      summary.errors.push({ gatewayId: String(gw.gatewayId), error: e?.message ?? String(e) });
    }
  }

  // Drop gateways that no longer exist in the account so the Devices list stays
  // accurate. (Stale LockMap.gatewayId pointers self-heal on the next sync.)
  // Guard: skip when we saw zero gateways — a transient empty TTLock response must
  // NOT wipe the table (Prisma treats notIn:[] as "match everything").
  if (gateways.length > 0) {
    const del = await prisma.gateway.deleteMany({ where: { gatewayId: { notIn: gateways.map((g) => BigInt(g.gatewayId)) } } });
    summary.removed = del.count;
  }

  return summary;
}
