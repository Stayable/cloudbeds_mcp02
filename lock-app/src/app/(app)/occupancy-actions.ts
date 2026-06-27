"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { visibleProperties } from "@/lib/properties";
import { syncOccupancy, type OccupancySyncResult } from "@/lib/occupancy-sync";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";

export interface OccupancyState {
  ran: boolean;
  results?: OccupancySyncResult[];
  error?: string;
}

/**
 * Rehydrate RoomState occupancy from Cloudbeds. A `propertyId` in the form data
 * scopes it to one property (Dashboard button); without one it covers every
 * property in the actor's scope (Portfolio button). Gated on `lock.sync`.
 */
export async function runOccupancySync(_prev: OccupancyState, formData: FormData): Promise<OccupancyState> {
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  try {
    const user = await requirePermission("lock.sync", propertyId || undefined);
    const ids = propertyId
      ? [propertyId]
      : visibleProperties({ scopeType: user.scopeType, propertyIds: user.propertyIds }).map((p) => p.id);

    const results = await syncOccupancy(ids);
    const occupied = results.reduce((n, r) => n + r.occupied, 0);
    const freed = results.reduce((n, r) => n + r.freed, 0);
    const errors = results.filter((r) => r.error);
    await writeAudit(user, {
      action: "occupancy_synced",
      propertyId: propertyId || "all",
      detail: buildDetail({
        outcome: errors.length ? "warning" : "success",
        message: `occupied ${occupied}, freed ${freed} across ${ids.length} ${ids.length === 1 ? "property" : "properties"}`,
        extra: { errors: errors.map((e) => `${e.propertyId}: ${e.error}`) },
      }),
    });

    if (propertyId) revalidatePath(`/p/${propertyId}/dashboard`);
    revalidatePath("/portfolio");
    return { ran: true, results };
  } catch (e: unknown) {
    return { ran: true, error: e instanceof Error ? e.message : String(e) };
  }
}
