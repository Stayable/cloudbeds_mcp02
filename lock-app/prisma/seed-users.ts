/**
 * Provision login accounts. OTP codes are only minted for emails that exist in
 * the User table (lib/auth.ts createOtp returns early for unknown users), so a
 * row here is what "allows" an address to log in. Idempotent via upsert.
 *
 * Run: npm run db:seed:users  (roles must already exist — run `npm run db:seed` first)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// email, display name, role
const USERS: [string, string, string][] = [
  ["rb@rise8companies.com", "Rob", "super_admin"],
  ["admin@rentstayable.com", "Admin", "super_admin"],
  ["bke@rentstayable.com", "BK Estocapio", "super_admin"],
  ["kate@rentstayable.com", "Kate", "super_admin"],
  ["gerardo@rentstayable.com", "Gerardo", "super_admin"],
  ["crystal@rentstayable.com", "Crystal", "super_admin"],
];

async function main() {
  for (const [email, name, roleName] of USERS) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`role "${roleName}" missing — run \`npm run db:seed\` first.`);
    await prisma.user.upsert({
      where: { email },
      update: { roleId: role.id, scopeType: "all", name },
      create: { email, name, roleId: role.id, scopeType: "all" },
    });
    console.log(`upserted ${email} (${roleName}, all)`);
  }
  console.log(`Done: ${USERS.length} users.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
