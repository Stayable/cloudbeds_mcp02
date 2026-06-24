/**
 * DEV/DEMO sample data for the read surfaces. Seeds LockMap (with health),
 * RoomState (occupancy), active Passcodes, and EventLog rows across ALL 8
 * Stayable properties so every Portfolio card and inner page shows realistic
 * content. THIS IS DUMMY DATA — real rows arrive once locks are registered to
 * the Stayable TTLock account and the Cloudbeds webhook fires.
 *
 * Idempotent: clears its own rows for the 8 properties, then recreates.
 * Lakeland (210972) + Kissimmee East (210986) keep their hand-crafted rooms
 * (incl. lock 388, used by the Door/Room detail demo); the rest are generated.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "bke@rise8companies.com";
const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// roomId, lockId, online, battery, occupancy, guest, checkout, activePin
type Occ = "free" | "reserved" | "occupied";
type Row = [string, number, boolean, number, Occ, string | null, string | null, string | null];

const GUESTS = [
  "Jordan Reyes", "Sam Carter", "Lee Nguyen", "Pat Morgan", "Robin Diaz",
  "Casey Flynn", "Avery Brooks", "Morgan Hale", "Riley Shaw", "Quinn Park",
  "Dana Cole", "Skyler Webb", "Jamie Fox", "Devon Pratt", "Harper Ruiz",
];

// Generate a believable spread of rooms. Deterministic (no RNG) so the seed is
// reproducible: ~1 offline per 7, ~1 low-battery per 6, occupancy cycles.
let lockSeq = 20000;
function genRooms(startRoom: number, count: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    const roomId = String(startRoom + i);
    const online = i % 7 !== 3;
    const battery = i % 6 === 5 ? 8 + (i % 5) : 45 + ((i * 7) % 55);
    const occ: Occ = i % 3 === 0 ? "occupied" : i % 3 === 1 ? "free" : "reserved";
    const guest = occ === "occupied" ? GUESTS[(startRoom + i) % GUESTS.length] : null;
    const checkout = occ === "occupied" ? `2026-06-${String(20 + (i % 8)).padStart(2, "0")}` : null;
    const pin = occ === "occupied" ? String(100000 + ((i * 7919) % 900000)) : null;
    out.push([roomId, lockSeq++, online, battery, occ, guest, checkout, pin]);
  }
  return out;
}

const ROOMS: Record<string, Row[]> = {
  // Hand-crafted demo property (lock 388 backs the Door/Room detail demo below)
  "210972": [ // Lakeland
    ["101", 388, true, 92, "occupied", "Jordan Reyes", "2026-06-20", "445572"],
    ["102", 401, true, 14, "reserved", "Sam Carter", "2026-06-21", null],
    ["103", 402, false, 60, "free", null, null, null],
    ["104", 403, true, 78, "occupied", "Lee Nguyen", "2026-06-19", "778890"],
    ...genRooms(105, 9),
  ],
  "210986": [ // Kissimmee East
    ["201", 511, true, 55, "free", null, null, null],
    ["202", 512, false, 9, "occupied", "Pat Morgan", "2026-06-18", "120066"],
    ["203", 513, true, 88, "reserved", "Robin Diaz", "2026-06-22", null],
    ...genRooms(204, 11),
  ],
  "206628": genRooms(101, 12), // Jacksonville North
  "210987": genRooms(101, 14), // Jacksonville West
  "210969": genRooms(101, 11), // Kissimmee West
  "210971": genRooms(101, 15), // Orlando OBT
  "208155": genRooms(101, 12), // St. Augustine
  "318197": genRooms(101, 10), // Davenport
};

const PROPS = Object.keys(ROOMS);

async function main() {
  // 1. super_admin user (role seeded by prisma/seed.ts)
  const role = await prisma.role.findUnique({ where: { name: "super_admin" } });
  if (!role) throw new Error("super_admin role missing — run `npm run db:seed` first.");
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { roleId: role.id, scopeType: "all", name: "BK Estocapio" },
    create: { email: ADMIN_EMAIL, name: "BK Estocapio", roleId: role.id, scopeType: "all" },
  });

  // 2. clear this seed's rows for the properties (idempotency)
  await prisma.passcode.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.eventLog.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.roomState.deleteMany({ where: { propertyId: { in: PROPS } } });
  await prisma.lockMap.deleteMany({ where: { propertyId: { in: PROPS } } });

  // 3. recreate per property
  for (const propertyId of PROPS) {
    const rows = ROOMS[propertyId];
    await prisma.lockMap.createMany({
      data: rows.map(([roomId, lockId, online, battery]) => ({
        propertyId, roomId, lockId: BigInt(lockId), alias: null,
        online, battery, lastSeen: new Date(now - 5 * 60 * 1000),
        model: "TTLock 8072", gatewayId: BigInt(9000),
      })),
    });
    await prisma.roomState.createMany({
      data: rows.map(([roomId, , , , occ, guest, checkout]) => ({
        propertyId, roomId, occupancyStatus: occ, guestName: guest, checkoutDate: checkout,
      })),
    });
    await prisma.passcode.createMany({
      data: rows
        .filter(([, , , , , , , pin]) => pin)
        .map(([roomId, lockId, , , , , , pin]) => ({
          reservationId: `RES-${propertyId}-${roomId}`, propertyId, roomId, lockId: BigInt(lockId),
          keyboardPwdId: BigInt(lockId * 10), pin: pin as string,
          startTs: BigInt(now - day), endTs: BigInt(now + 2 * day), status: "active", type: "guest",
        })),
    });

    // a spread of activity rows, derived from this property's own rooms
    const firstRow = rows[0];
    const offlineRow = rows.find((r) => !r[2]);
    const lowBattRow = rows.find((r) => r[3] < 20);
    const events = [
      { source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: firstRow[0], lockId: BigInt(firstRow[1]), detail: { message: "PIN ••••created", outcome: "success" } },
      { source: "field", event: "ui", action: "code_revealed", propertyId, roomId: firstRow[0], lockId: BigInt(firstRow[1]), actorEmail: ADMIN_EMAIL, actorRole: "super_admin", detail: { message: "revealed guest code", outcome: "success" } },
    ] as { source: string; event: string; action: string; propertyId: string; roomId: string; lockId: bigint; actorEmail?: string; actorRole?: string; detail: object }[];
    if (lowBattRow) events.push({ source: "cron", event: "health", action: "low_battery", propertyId, roomId: lowBattRow[0], lockId: BigInt(lowBattRow[1]), detail: { message: `battery ${lowBattRow[3]}%`, outcome: "warning" } });
    if (offlineRow) events.push({ source: "webhook", event: "reservation/created", action: "guest_code_created", propertyId, roomId: offlineRow[0], lockId: BigInt(offlineRow[1]), detail: { message: "create failed: gateway offline", outcome: "failed" } });
    await prisma.eventLog.createMany({ data: events });
  }

  // Door/Room detail demo: Lakeland room 101 (lock 388) gets a staff backup code
  // and a revoked historical guest code, alongside its live guest code above.
  await prisma.passcode.createMany({
    data: [
      { reservationId: null, propertyId: "210972", roomId: "101", lockId: 388n, keyboardPwdId: 9002n, pin: "330077", startTs: 0n, endTs: 0n, status: "active", type: "backup" },
      { reservationId: "DEMO-RES-0", propertyId: "210972", roomId: "101", lockId: 388n, keyboardPwdId: 9000n, pin: "111190", startTs: BigInt(Date.parse("2026-06-10T00:00:00Z")), endTs: BigInt(Date.parse("2026-06-12T23:59:59Z")), status: "revoked", type: "guest" },
    ],
    skipDuplicates: true,
  });

  const totalLocks = PROPS.reduce((n, p) => n + ROOMS[p].length, 0);
  console.log(`Dev seed complete: ${PROPS.length} properties, ${totalLocks} test locks, user ${ADMIN_EMAIL}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
