/**
 * Pure logic behind the Users page. No Prisma import — the server actions do the
 * I/O and hand plain objects in here, so every rule below is unit-testable.
 *
 * Context that shapes this file: lock-app is OTP-only (no passwords). A User row
 * IS login access, so "add" and "invite" are one action, and "delete" is an
 * ARCHIVE — the row is retained so the EventLog audit trail can still resolve the
 * actor. See docs/superpowers/specs/2026-08-13-lock-app-user-management-design.md.
 */
import { PROPERTIES } from "./properties";

export interface ManagedUser {
  id: string;
  email: string;
  roleName: string;
  scopeType: string;
  propertyIds: readonly string[];
  disabledAt: Date | null;
  archivedAt: Date | null;
  lastLoginAt: Date | null;
}

export type UserStatus = "active" | "invited" | "disabled" | "archived";

/** Operations gated by canManageUser. `rename` is the only self-safe one. */
export type ManageOp = "rename" | "role" | "disable" | "archive" | "reset";

export const SUPER_ADMIN = "super_admin";

/**
 * Archived outranks disabled outranks invited. "invited" means the account is
 * live but has never been signed into — usually the welcome email never landed.
 */
export function userStatus(u: ManagedUser, _now: Date): UserStatus {
  if (u.archivedAt) return "archived";
  if (u.disabledAt) return "disabled";
  if (!u.lastLoginAt) return "invited";
  return "active";
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Deliberately loose: enough to catch a typo'd address before we create a row
 * nobody can sign into, without pretending to validate deliverability. Requires
 * a dotted domain, so bare hostnames like "user@localhost" are rejected.
 */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(normalizeEmail(raw));
}

/** Human-readable property scope for the roster table. */
export function scopeSummary(u: ManagedUser): string {
  if (u.scopeType === "all") return "All properties";
  const names = PROPERTIES.filter((p) => u.propertyIds.includes(p.id)).map((p) => p.name);
  return names.length ? names.join(", ") : "No properties";
}

function activeSuperAdmins(all: readonly ManagedUser[]): ManagedUser[] {
  return all.filter((u) => u.roleName === SUPER_ADMIN && !u.disabledAt && !u.archivedAt);
}

/**
 * The two safety rails on user administration:
 *
 *  1. No self-harm — you cannot disable, archive, or re-role your OWN account.
 *     (Renaming yourself is fine.) Stops an admin locking themselves out.
 *  2. Never zero admins — the last ACTIVE super_admin cannot be disabled,
 *     archived, or demoted. There is no console fallback: if every super_admin
 *     loses access, nobody can ever restore it from the UI.
 *
 * `all` must be the full user set (including disabled/archived) so rail 2 counts
 * only genuinely usable admins.
 */
export function canManageUser(
  actor: ManagedUser,
  target: ManagedUser,
  all: readonly ManagedUser[],
  op: ManageOp,
): { ok: true } | { ok: false; reason: string } {
  const selfDestructive = op === "disable" || op === "archive" || op === "role";
  if (actor.id === target.id && selfDestructive) {
    return {
      ok: false,
      reason: "You can't disable, delete, or change the role of your own account — ask another admin to do it.",
    };
  }

  if (selfDestructive && target.roleName === SUPER_ADMIN) {
    const remaining = activeSuperAdmins(all).filter((u) => u.id !== target.id);
    if (remaining.length === 0) {
      return {
        ok: false,
        reason: "This is the last super_admin — promote someone else first, or nobody will be able to manage users.",
      };
    }
  }

  return { ok: true };
}
