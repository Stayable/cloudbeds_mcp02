/**
 * Seed the three default roles (spec §7). Idempotent via upsert. Admins can clone
 * or edit these in the UI; isSystem=true protects them from deletion.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

const ATTENDANT = [
  "rooms.view",
  "guest_code.reveal",
  "backup_code.reveal",
  "lock.sync",
  "devices.view",
  "activity.view",
];

const MANAGER = PERMISSIONS.filter((p) => p !== "roles.manage" && p !== "users.manage");

async function main() {
  const roles = [
    { name: "super_admin", permissions: [...PERMISSIONS] },
    { name: "manager", permissions: MANAGER },
    { name: "attendant", permissions: ATTENDANT },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { permissions: r.permissions, isSystem: true },
      create: { name: r.name, permissions: r.permissions, isSystem: true },
    });
  }
  console.log(`Seeded ${roles.length} roles.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
