import { describe, it, expect } from "vitest";
import {
  userStatus,
  normalizeEmail,
  isValidEmail,
  scopeSummary,
  canManageUser,
  type ManagedUser,
} from "./user-admin";

const NOW = new Date("2026-08-13T12:00:00Z");

function user(over: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: "u1",
    email: "a@rentstayable.com",
    roleName: "attendant",
    scopeType: "all",
    propertyIds: [],
    disabledAt: null,
    archivedAt: null,
    lastLoginAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

describe("userStatus", () => {
  it("is active for a signed-in, unflagged user", () => {
    expect(userStatus(user(), NOW)).toBe("active");
  });

  it("is invited when the user has never signed in", () => {
    expect(userStatus(user({ lastLoginAt: null }), NOW)).toBe("invited");
  });

  it("is disabled when disabledAt is set", () => {
    expect(userStatus(user({ disabledAt: NOW }), NOW)).toBe("disabled");
  });

  it("archived outranks disabled and invited", () => {
    const u = user({ archivedAt: NOW, disabledAt: NOW, lastLoginAt: null });
    expect(userStatus(u, NOW)).toBe("archived");
  });
});

describe("normalizeEmail / isValidEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  BKE@Rise8Companies.com ")).toBe("bke@rise8companies.com");
  });

  it("accepts a normal work address", () => {
    expect(isValidEmail("gerardo@rentstayable.com")).toBe(true);
  });

  it("rejects blanks, missing @, and missing domain dot", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nobody")).toBe(false);
    expect(isValidEmail("nobody@localhost")).toBe(false);
    expect(isValidEmail("a b@rentstayable.com")).toBe(false);
  });
});

describe("scopeSummary", () => {
  it("reports all-properties scope without listing them", () => {
    expect(scopeSummary(user({ scopeType: "all" }))).toBe("All properties");
  });

  it("names the scoped properties in catalog order, not stored order", () => {
    const u = user({ scopeType: "property", propertyIds: ["210972", "210986"] });
    expect(scopeSummary(u)).toBe("Kissimmee East, Lakeland");
  });

  it("flags a scoped user with no properties as having no access", () => {
    expect(scopeSummary(user({ scopeType: "property", propertyIds: [] }))).toBe("No properties");
  });

  it("ignores unknown property ids", () => {
    const u = user({ scopeType: "property", propertyIds: ["210972", "999999"] });
    expect(scopeSummary(u)).toBe("Lakeland");
  });
});

describe("canManageUser", () => {
  const admin = user({ id: "admin", email: "bke@rise8companies.com", roleName: "super_admin" });
  const other = user({ id: "u2", email: "kate@rentstayable.com", roleName: "attendant" });
  const admin2 = user({ id: "admin2", email: "rb@rise8companies.com", roleName: "super_admin" });

  it("allows managing another user", () => {
    expect(canManageUser(admin, other, [admin, other], "disable").ok).toBe(true);
  });

  it("allows renaming yourself", () => {
    expect(canManageUser(admin, admin, [admin, other], "rename").ok).toBe(true);
  });

  it("refuses to disable, archive, or re-role yourself", () => {
    for (const op of ["disable", "archive", "role"] as const) {
      const res = canManageUser(admin, admin, [admin, admin2], op);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/your own account/i);
    }
  });

  it("refuses to disable the last active super_admin", () => {
    const res = canManageUser(admin, admin2, [admin, admin2], "disable");
    expect(res.ok).toBe(true); // two admins — fine

    const solo = canManageUser(other, admin2, [other, admin2], "disable");
    expect(solo.ok).toBe(false);
    if (!solo.ok) expect(solo.reason).toMatch(/last super_admin/i);
  });

  it("does not count disabled or archived admins toward the last-admin check", () => {
    const sleeping = user({ id: "a3", roleName: "super_admin", disabledAt: NOW });
    const gone = user({ id: "a4", roleName: "super_admin", archivedAt: NOW });
    const res = canManageUser(other, admin2, [other, admin2, sleeping, gone], "archive");
    expect(res.ok).toBe(false);
  });

  it("refuses to demote the last active super_admin", () => {
    const res = canManageUser(other, admin2, [other, admin2], "role");
    expect(res.ok).toBe(false);
  });
});
