import { describe, it, expect } from "vitest";
import { PERMISSIONS, hasPermission, type ActorPermissions } from "./permissions";

const superAdmin: ActorPermissions = { permissions: PERMISSIONS, scopeType: "all", propertyIds: [] };
const attendant: ActorPermissions = {
  permissions: ["rooms.view", "guest_code.reveal", "backup_code.reveal"],
  scopeType: "property",
  propertyIds: ["210972"],
};

describe("hasPermission", () => {
  it("grants any permission to a super_admin with 'all' scope", () => {
    expect(hasPermission(superAdmin, "roles.manage")).toBe(true);
    expect(hasPermission(superAdmin, "backup_code.rotate", "210987")).toBe(true);
  });

  it("grants a held permission within the actor's property scope", () => {
    expect(hasPermission(attendant, "guest_code.reveal", "210972")).toBe(true);
  });

  it("denies a permission the actor does not hold", () => {
    expect(hasPermission(attendant, "backup_code.rotate", "210972")).toBe(false);
  });

  it("denies an out-of-scope property even when the permission is held", () => {
    expect(hasPermission(attendant, "guest_code.reveal", "210987")).toBe(false);
  });

  it("ignores scope when no property is supplied (global view)", () => {
    expect(hasPermission(attendant, "rooms.view")).toBe(true);
  });
});
