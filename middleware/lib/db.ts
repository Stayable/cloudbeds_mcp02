// Prisma client singleton (Neon Postgres). Mirrors the client-portal pattern:
// reuse one client across hot reloads / warm serverless instances to avoid
// exhausting connections.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
