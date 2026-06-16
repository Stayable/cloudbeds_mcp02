/**
 * Page-level access helpers built on the Foundation's session + permissions.
 * `sessionCan` is the non-throwing check for gating nav and rendering <Forbidden/>;
 * `requireUserOrRedirect` bounces anonymous users to /login.
 */
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { hasPermission, type Permission, type ActorPermissions } from "./permissions";
import { visibleProperties, type Property } from "./properties";

export function toActor(u: SessionUser): ActorPermissions {
  return { permissions: u.permissions, scopeType: u.scopeType, propertyIds: u.propertyIds };
}

export function sessionCan(u: SessionUser, permission: Permission, propertyId?: string): boolean {
  return hasPermission(toActor(u), permission, propertyId);
}

export function userProperties(u: SessionUser): Property[] {
  return visibleProperties({ scopeType: u.scopeType, propertyIds: u.propertyIds });
}

export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
