"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";
import { CHECKOUT_GRACE_MAX, TRANSFER_GRACE_MAX, clampGrace } from "@/lib/settings";

const SINGLETON = "singleton";

/**
 * Save the Access-timing settings (grace minutes). Gated on settings.manage.
 * Stores values only — the revoke paths will read them once the team sets the
 * final timing (the behavior wiring is a separate, tracked task).
 */
export async function saveAccessTiming(formData: FormData): Promise<void> {
  const user = await requirePermission("settings.manage");
  const checkoutGraceMinutes = clampGrace(formData.get("checkoutGraceMinutes"), CHECKOUT_GRACE_MAX);
  const transferGraceMinutes = clampGrace(formData.get("transferGraceMinutes"), TRANSFER_GRACE_MAX);

  await prisma.appSettings.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, checkoutGraceMinutes, transferGraceMinutes },
    update: { checkoutGraceMinutes, transferGraceMinutes },
  });
  await writeAudit(user, {
    action: "settings_updated",
    propertyId: "all",
    detail: buildDetail({ message: `access timing — checkout ${checkoutGraceMinutes}m, transfer ${transferGraceMinutes}m` }),
  });
  revalidatePath("/settings");
}
