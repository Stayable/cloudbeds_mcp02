import {
  listLocks,
  getLockDetail,
  listGateways,
  listGatewaysForLock,
  listPasscodes,
} from "@/lib/ttlock";

// TTLock client uses node:crypto + fetch — needs the Node.js runtime, not edge.
export const runtime = "nodejs";
export const maxDuration = 30;
// Live device data; never cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/ttlock-locks
 *
 * Operator-facing inventory of every lock + gateway on the account, with the
 * detail you need to build the room→lock map: each lock's `lockId`, alias,
 * MAC, battery, feature flags, gateway reachability, and how many passcodes are
 * currently provisioned on it.
 *
 * This is read-only and safe to hit anytime. It does NOT create/delete PINs.
 */
export async function GET() {
  try {
    const [{ total: lockTotal, list: locks }, { list: gateways }] = await Promise.all([
      listLocks(1, 200),
      listGateways(1, 200),
    ]);

    const enriched = await Promise.all(
      locks.map(async (l: any) => {
        const lockId = l.lockId;
        // Detail + per-lock gateway reachability + current passcode count.
        const [detail, lockGateways, pwds] = await Promise.all([
          getLockDetail(lockId).catch((e) => ({ _error: String(e?.message ?? e) })),
          listGatewaysForLock(lockId).catch(() => []),
          listPasscodes(lockId, 1, 100).catch(() => ({ total: 0, list: [] })),
        ]);

        const online = Array.isArray(lockGateways)
          ? lockGateways.some((g: any) => g.isOnline === 1)
          : false;

        return {
          lockId,
          lockName: l.lockName,
          lockAlias: l.lockAlias ?? null,
          lockMac: l.lockMac ?? detail?.lockMac ?? null,
          battery: detail?.electricQuantity ?? l.electricQuantity ?? null,
          featureValue: detail?.featureValue ?? l.featureValue ?? null,
          modelNum: detail?.modelNum ?? null,
          firmwareRevision: detail?.firmwareRevision ?? null,
          hasGateway: l.hasGateway, // 1 = bound to a gateway
          reachableViaGateway: online,
          gatewayCount: Array.isArray(lockGateways) ? lockGateways.length : 0,
          passcodesProvisioned: pwds.total ?? 0,
        };
      }),
    );

    return Response.json({
      ok: true,
      lockCount: lockTotal,
      gatewayCount: gateways.length,
      gateways: gateways.map((g: any) => ({
        gatewayId: g.gatewayId,
        gatewayName: g.gatewayName,
        gatewayMac: g.gatewayMac ?? null,
        networkName: g.networkName ?? null,
        isOnline: g.isOnline === 1,
        locksBound: g.lockNum ?? 0,
      })),
      locks: enriched,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 502 },
    );
  }
}
