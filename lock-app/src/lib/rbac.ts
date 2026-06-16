import { getSession, type SessionUser } from "./auth";
import { hasPermission, type Permission, type ActorPermissions } from "./permissions";

export class AuthError extends Error {
  constructor(readonly code: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function toActor(u: SessionUser): ActorPermissions {
  return { permissions: u.permissions, scopeType: u.scopeType, propertyIds: u.propertyIds };
}

/** Require a logged-in user, or throw AuthError(401). */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError(401, "Unauthorized");
  return user;
}

/** Require a permission (optionally scoped to a property), or throw AuthError. */
export async function requirePermission(
  permission: Permission,
  propertyId?: string,
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasPermission(toActor(user), permission, propertyId)) {
    throw new AuthError(403, `Forbidden: missing ${permission}`);
  }
  return user;
}
