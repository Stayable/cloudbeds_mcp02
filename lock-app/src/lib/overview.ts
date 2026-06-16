/**
 * Portfolio aggregation for the Overview screen: per-property lock-health counts.
 * "needsAttention" = locks that are offline OR low-battery, counted once each
 * (a lock that is both still counts as one). Alert *records* arrive in Plan 4;
 * until then this derived count is the at-a-glance "is anything broken?" signal.
 */
import type { Property } from "./properties";

const LOW_BATTERY_PCT = 20;

export interface LockHealth {
  online: boolean;
  battery: number | null;
}

export interface PropertyHealth {
  propertyId: string;
  name: string;
  totalLocks: number;
  online: number;
  offline: number;
  lowBattery: number;
  needsAttention: number;
}

export function summarizeProperty(property: Property, locks: LockHealth[]): PropertyHealth {
  let online = 0;
  let offline = 0;
  let lowBattery = 0;
  let needsAttention = 0;
  for (const lock of locks) {
    const isLow = lock.battery != null && lock.battery < LOW_BATTERY_PCT;
    if (lock.online) online++;
    else offline++;
    if (isLow) lowBattery++;
    if (!lock.online || isLow) needsAttention++;
  }
  return {
    propertyId: property.id,
    name: property.name,
    totalLocks: locks.length,
    online,
    offline,
    lowBattery,
    needsAttention,
  };
}
