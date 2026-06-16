/**
 * Permission catalog + check. Roles are data-driven (DB records holding a subset
 * of these strings) — see the design spec §7. A user's effective access is the
 * intersection of their role's permissions and their assigned property scope.
 */
export const PERMISSIONS = [
  "rooms.view",
  "guest_code.reveal",
  "guest_code.revoke",
  "guest_code.generate_manual",
  "backup_code.reveal",
  "backup_code.rotate",
  "lock.sync",
  "devices.view",
  "lock.mark_registered",
  "mapping.edit",
  "activity.view",
  "activity.export",
  "users.manage",
  "roles.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface ActorPermissions {
  permissions: readonly string[];
  scopeType: "all" | "group" | "property";
  /** Properties the actor may act on when scopeType !== "all". */
  propertyIds: readonly string[];
}

/** Is `propertyId` within the actor's scope? `all` scope is unrestricted. */
function inScope(actor: ActorPermissions, propertyId?: string): boolean {
  if (actor.scopeType === "all") return true;
  if (!propertyId) return true; // global/portfolio view: scope applies per-row later
  return actor.propertyIds.includes(propertyId);
}

/** Does the actor hold `permission`, and (if given) for `propertyId`? */
export function hasPermission(
  actor: ActorPermissions,
  permission: Permission,
  propertyId?: string,
): boolean {
  if (!actor.permissions.includes(permission)) return false;
  return inScope(actor, propertyId);
}
