/**
 * Pure view-model for gateways. Property inference + DB-row→display mapping,
 * kept free of Prisma/TTLock so it's unit-testable. The sync glue and pages feed
 * plain values in.
 */

/**
 * Infer the property a gateway belongs to from the propertyIds of the locks it
 * serves. Gateways are account-global in TTLock (no property tag), but a gateway
 * physically sits at one property — so the most common non-null propertyId among
 * its served locks is its property. Ties break by first-seen for determinism;
 * empty / all-null → null (unknown, hidden from per-property sections).
 */
export function inferGatewayProperty(propIds: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  propIds.forEach((p, i) => {
    if (!p) return;
    counts.set(p, (counts.get(p) ?? 0) + 1);
    if (!firstSeen.has(p)) firstSeen.set(p, i);
  });
  let best: string | null = null;
  let bestCount = 0;
  for (const [p, c] of counts) {
    if (c > bestCount || (c === bestCount && best != null && firstSeen.get(p)! < firstSeen.get(best)!)) {
      best = p;
      bestCount = c;
    }
  }
  return best;
}

export interface GatewayRow {
  gatewayId: string;
  name: string;
  online: boolean;
  lockCount: number | null;
  lastSeen: string | null;
}

/** Format an epoch/Date as "YYYY-MM-DD HH:MM" (UTC), matching the lock cards. */
function fmtSeen(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : null;
}

export function toGatewayRow(g: {
  gatewayId: bigint;
  name: string;
  online: boolean;
  lockCount: number | null;
  lastSeen: Date | null;
}): GatewayRow {
  return {
    gatewayId: g.gatewayId.toString(),
    name: g.name,
    online: g.online,
    lockCount: g.lockCount,
    lastSeen: fmtSeen(g.lastSeen),
  };
}
