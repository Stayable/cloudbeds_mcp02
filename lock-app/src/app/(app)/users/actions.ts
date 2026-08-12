"use server";

/**
 * Server actions for the Users page. Every action:
 *   1. requires an authenticated actor holding `users.manage`,
 *   2. runs the safety rails in lib/user-admin.ts (canManageUser),
 *   3. writes an EventLog row attributing the change,
 *   4. returns ActionResult — never throws — so failures land in the modal
 *      instead of crashing the route.
 *
 * lock-app is OTP-only, so there are no passwords here. "Reset access" is the
 * password-reset equivalent: kill sessions + pending codes, forcing a fresh OTP.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sessionCan } from "@/lib/session-access";
import { writeAudit } from "@/lib/audit-write";
import type { ActionResult } from "@/lib/action-result";
import { PROPERTIES } from "@/lib/properties";
import {
  canManageUser,
  isValidEmail,
  normalizeEmail,
  scopeSummary,
  type ManageOp,
  type ManagedUser,
} from "@/lib/user-admin";
import { sendInviteEmail } from "@/lib/user-invite-email";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  scopeType: true,
  propertyIds: true,
  disabledAt: true,
  archivedAt: true,
  lastLoginAt: true,
  role: { select: { name: true } },
} as const;

type UserRow = {
  id: string;
  email: string;
  name: string;
  scopeType: string;
  propertyIds: string[];
  disabledAt: Date | null;
  archivedAt: Date | null;
  lastLoginAt: Date | null;
  role: { name: string };
};

function toManaged(u: UserRow): ManagedUser {
  return {
    id: u.id,
    email: u.email,
    roleName: u.role.name,
    scopeType: u.scopeType,
    propertyIds: u.propertyIds,
    disabledAt: u.disabledAt,
    archivedAt: u.archivedAt,
    lastLoginAt: u.lastLoginAt,
  };
}

/** Actor + full user set + the target, or a friendly failure. */
async function loadContext(targetId?: string): Promise<
  | { ok: true; actor: ManagedUser; actorSession: { id: string; email: string; roleName: string }; all: ManagedUser[]; target?: ManagedUser }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired — sign in again." };
  if (!sessionCan(session, "users.manage")) {
    return { ok: false, error: "You don't have permission to manage users." };
  }

  const rows = (await prisma.user.findMany({ select: USER_SELECT })) as UserRow[];
  const all = rows.map(toManaged);
  const actor = all.find((u) => u.id === session.id);
  if (!actor) return { ok: false, error: "Your account could no longer be found." };

  let target: ManagedUser | undefined;
  if (targetId) {
    target = all.find((u) => u.id === targetId);
    if (!target) return { ok: false, error: "That user no longer exists." };
  }

  return {
    ok: true,
    actor,
    actorSession: { id: session.id, email: session.email, roleName: session.roleName },
    all,
    target,
  };
}

/** Terminate everything that currently grants access: live sessions + unused codes. */
async function revokeAccessArtifacts(userId: string, email: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.magicLink.updateMany({ where: { email, used: false }, data: { used: true } });
}

/** Parse role + scope out of a form, validating against the real catalogs. */
async function readRoleAndScope(
  formData: FormData,
): Promise<{ ok: true; roleId: string; roleName: string; scopeType: string; propertyIds: string[] } | { ok: false; error: string }> {
  const roleName = String(formData.get("roleName") ?? "").trim();
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) return { ok: false, error: `Unknown role "${roleName}".` };

  const scopeType = String(formData.get("scopeType") ?? "property").trim();
  if (scopeType !== "all" && scopeType !== "property") {
    return { ok: false, error: "Scope must be all properties or specific properties." };
  }

  // Only ids from the real catalog — a forged checkbox value can't widen access.
  const picked = formData.getAll("propertyIds").map(String);
  const propertyIds = scopeType === "all" ? [] : PROPERTIES.filter((p) => picked.includes(p.id)).map((p) => p.id);
  if (scopeType === "property" && propertyIds.length === 0) {
    return { ok: false, error: "Pick at least one property, or give this user access to all properties." };
  }

  return { ok: true, roleId: role.id, roleName: role.name, scopeType, propertyIds };
}

export async function addUser(formData: FormData): Promise<ActionResult> {
  const ctx = await loadContext();
  if (!ctx.ok) return ctx;

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter the person's name." };

  const rs = await readRoleAndScope(formData);
  if (!rs.ok) return rs;

  const existing = await prisma.user.findUnique({ where: { email }, select: USER_SELECT });
  if (existing) {
    // Re-adding an archived person restores them rather than erroring — that's
    // what the operator means, and it keeps their audit history attached.
    if (!existing.archivedAt) return { ok: false, error: `${email} already has access.` };
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, roleId: rs.roleId, scopeType: rs.scopeType, propertyIds: rs.propertyIds, archivedAt: null, disabledAt: null },
    });
    await writeAudit(ctx.actorSession, {
      action: "user_restored",
      detail: { email, name, role: rs.roleName, scopeType: rs.scopeType, propertyIds: rs.propertyIds },
    });
  } else {
    await prisma.user.create({
      data: { email, name, roleId: rs.roleId, scopeType: rs.scopeType, propertyIds: rs.propertyIds },
    });
    await writeAudit(ctx.actorSession, {
      action: "user_added",
      detail: { email, name, role: rs.roleName, scopeType: rs.scopeType, propertyIds: rs.propertyIds },
    });
  }

  await deliverInvite(ctx.actorSession, { email, name, roleName: rs.roleName, scopeType: rs.scopeType, propertyIds: rs.propertyIds });
  revalidatePath("/users");
  return { ok: true };
}

/**
 * Invite delivery is best-effort: the User row is what grants access, so a mail
 * failure is logged and surfaced in Activity, never rolled back into an error
 * that would make the operator think the user wasn't created.
 */
async function deliverInvite(
  actor: { id: string; email: string; roleName: string },
  u: { email: string; name: string; roleName: string; scopeType: string; propertyIds: string[] },
): Promise<void> {
  const summary = scopeSummary({
    id: "", email: u.email, roleName: u.roleName, scopeType: u.scopeType,
    propertyIds: u.propertyIds, disabledAt: null, archivedAt: null, lastLoginAt: null,
  });
  try {
    await sendInviteEmail({ name: u.name, email: u.email, roleName: u.roleName, scopeSummary: summary });
    await writeAudit(actor, { action: "user_invited", detail: { email: u.email } });
  } catch (err) {
    console.error(`[users] invite email failed for ${u.email}:`, err);
    await writeAudit(actor, {
      action: "user_invite_failed",
      detail: { email: u.email, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function updateUser(formData: FormData): Promise<ActionResult> {
  const targetId = String(formData.get("userId") ?? "");
  const ctx = await loadContext(targetId);
  if (!ctx.ok) return ctx;
  const target = ctx.target!;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter the person's name." };

  const rs = await readRoleAndScope(formData);
  if (!rs.ok) return rs;

  // Only a role/scope CHANGE is gated — renaming yourself is always allowed.
  const changingAccess =
    rs.roleName !== target.roleName ||
    rs.scopeType !== target.scopeType ||
    rs.propertyIds.join(",") !== [...target.propertyIds].join(",");
  if (changingAccess) {
    const gate = canManageUser(ctx.actor, target, ctx.all, "role");
    if (!gate.ok) return { ok: false, error: gate.reason };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { name, roleId: rs.roleId, scopeType: rs.scopeType, propertyIds: rs.propertyIds },
  });

  // A narrowed scope or reduced role must not stay live in an open session.
  if (changingAccess) await prisma.session.deleteMany({ where: { userId: target.id } });

  await writeAudit(ctx.actorSession, {
    action: "user_updated",
    detail: {
      email: target.email,
      name,
      role: rs.roleName,
      scopeType: rs.scopeType,
      propertyIds: rs.propertyIds,
      from: { role: target.roleName, scopeType: target.scopeType, propertyIds: target.propertyIds },
    },
  });
  revalidatePath("/users");
  return { ok: true };
}

async function flagUser(
  targetId: string,
  op: Extract<ManageOp, "disable" | "archive">,
  value: boolean,
): Promise<ActionResult> {
  const ctx = await loadContext(targetId);
  if (!ctx.ok) return ctx;
  const target = ctx.target!;

  // Only the restrictive direction needs gating — re-enabling is always safe.
  if (value) {
    const gate = canManageUser(ctx.actor, target, ctx.all, op);
    if (!gate.ok) return { ok: false, error: gate.reason };
  }

  const field = op === "disable" ? "disabledAt" : "archivedAt";
  const data: Record<string, Date | null> = { [field]: value ? new Date() : null };
  // Restoring an archived user shouldn't leave them silently disabled.
  if (op === "archive" && !value) data.disabledAt = null;

  await prisma.user.update({ where: { id: target.id }, data });
  if (value) await revokeAccessArtifacts(target.id, target.email);

  const action = op === "disable" ? (value ? "user_disabled" : "user_enabled") : value ? "user_archived" : "user_restored";
  await writeAudit(ctx.actorSession, { action, detail: { email: target.email, name: target.email } });
  revalidatePath("/users");
  return { ok: true };
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<ActionResult> {
  return flagUser(userId, "disable", disabled);
}

export async function setUserArchived(userId: string, archived: boolean): Promise<ActionResult> {
  return flagUser(userId, "archive", archived);
}

/**
 * The OTP-only equivalent of "change password": drop every live session and burn
 * any unredeemed code, so the next sign-in must be a fresh emailed OTP. Use when
 * a device is lost or a shared mailbox may have been exposed.
 */
export async function resetAccess(userId: string): Promise<ActionResult> {
  const ctx = await loadContext(userId);
  if (!ctx.ok) return ctx;
  const target = ctx.target!;

  await revokeAccessArtifacts(target.id, target.email);
  await writeAudit(ctx.actorSession, { action: "user_access_reset", detail: { email: target.email } });
  revalidatePath("/users");
  return { ok: true };
}

export async function resendInvite(userId: string): Promise<ActionResult> {
  const ctx = await loadContext(userId);
  if (!ctx.ok) return ctx;
  const target = ctx.target!;
  if (target.archivedAt) return { ok: false, error: "Restore this user before re-sending their invite." };

  const row = await prisma.user.findUnique({ where: { id: target.id }, select: { name: true } });
  await deliverInvite(ctx.actorSession, {
    email: target.email,
    name: row?.name ?? "",
    roleName: target.roleName,
    scopeType: target.scopeType,
    propertyIds: [...target.propertyIds],
  });
  revalidatePath("/users");
  return { ok: true };
}
