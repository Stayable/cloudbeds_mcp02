/**
 * DEV-ONLY sample data for the read surfaces (Plan 2). Seeds LockMap (with health),
 * RoomState (occupancy), active Passcodes, and a spread of EventLog rows for two
 * properties, plus a super_admin user. Idempotent: clears its own rows for those
 * two properties, then recreates. DO NOT run against production.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROPS = ["210972", "210986"]; // Lakeland, Kissimmee East
const ADMIN_EMAIL = "bke@rise8companies.com";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// roomId, lockId, online, battery, occupancy, guest, checkout, activePin
type Row = [string, number, boolean, number, "free" | "reserved" | "occupied", string | null, string | null, string | null];
const ROOMS: Record<string, Row[]> = {
  "210972": [
    ["101", 388, true, 92, "occupied", "Jordan Reyes", "2026-06-20", "445572"],
    ["102", 401, true, 14, "reserved", "Sam Carter", "2026-06-21", null],
    ["103", 402, false, 60, "free", null, null, null],
    ["104", 403, true, 78, "occupied", "Lee Nguyen", "2026-06-19", "778890"],
  ],
  "210986": [
    ["201", 511, true, 55, "free", null, null, null],
    ["202", 512, false, 9, "occupied", "Pat Morgan", "2026-06-18", "120066"],
    ["203", 513, true, 88, "reserved", "Robin Diaz", "2026-06-22", null],
  ],
};

async function main() {
  // 1. super_admin user (role seeded by prisma/seed.ts)
  const role = await prisma.role.findUnique({ where: { name: "super_admin" } });
  if (!role) throw new Error("super_admin role missing — run `npm run db:seed` first.");
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { roleId: role.id, scopeType: "all", name: "BK Estocapio" },
    create: { email: ADMIN_EMAIL, name: "BK Estocapio", roleId: role.id, scopeType: "all" },
  });

  // 2. clear this seed's rows for the two properties (idempotency)
  await prisma.passcode.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.eventLog.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.roomState.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.lockMap.deleteMany({ where: { propertyId: { in: PROPS } } });

  // 3. recreate per property
  for (const propertyId of PROPS) {
    for (const [roomId, lockId, online, battery, occ, guest, checkout, pin] of ROOMS[propertyId]) {
      await prisma.lockMap.create({
        data: {
          propertyId, roomId, lockId: BigInt(lockId), alias: null,
          online, battery, lastSeen: new Date(now - 5 * 60 * 1000), model: "TTLock 8072", gatewayId: BigInt(9000),
        },
      });
      await prisma.roomState.create({
        data: { propertyId, roomId, occupancyStatus: occ, guestName: guest, checkoutDate: checkout },
      });
      if (pin) {
        await prisma.passcode.create({
          data: {
            reservationId: `RES-${propertyId}-${roomId}`, propertyId, roomId, lockId: BigInt(lockId),
            keyboardPwdId: BigInt(lockId * 10), pin, startTs: BigInt(now - day), endTs: BigInt(now + 2 * day),
            status: "active", type: "guest",
          },
        });
      }
    }
    // a spread of activity rows incl. a reveal (amber) and a failure (red)
    await prisma.eventLog.createMany({
      data: [
        { source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: "101", lockId: BigInt(388), detail: { message: "PIN ••••72 created", outcome: "success" } },
        { source: "field", event: "ui", action: "code_revealed", propertyId, roomId: "101", lockId: BigInt(388), actorEmail: ADMIN_EMAIL, actorRole: "super_admin", detail: { message: "revealed guest code", outcome: "success" } },
        { source: "cron", event: "health", action: "low_battery", propertyId, roomId: "102", lockId: BigInt(401), detail: { message: "battery 14%", outcome: "warning" } },
        { source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: "103", lockId: BigInt(402), detail: { message: "create failed: gateway offline", outcome: "failed" } },
      ],
    });
  }
  console.log(`Dev seed complete: ${PROPS.length} properties, user ${ADMIN_EMAIL}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
