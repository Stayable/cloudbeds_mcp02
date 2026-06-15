# Lock-App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `lock-app/` Next.js project, extend the shared Neon schema with the lock-app's tables/columns, and build magic-link auth + a data-driven RBAC permission gate — producing a logged-in, role-aware app shell.

**Architecture:** `lock-app/` is a Vercel-deployable Next.js 14 (App Router) project pointing at the **same Neon Postgres the middleware uses** (data is the integration point; code is not shared across siblings). Its Prisma schema is a **superset**: shared tables (`LockMap`, `Passcode`, `EventLog`) mirrored from the middleware, plus the lock-app's own `User`/`Session`/`MagicLink`/`Role`/`PropertyGroup`/`RoomState`/`TtlockToken` tables and the new lock-health/occupancy/`Passcode.type` columns. Auth reuses `client-portal`'s magic-link + JWT-cookie pattern. Authorization is a permission catalog + role records (no hardcoded role enum), gated by a `requirePermission` helper.

**Tech Stack:** Next.js 14, React 18, Prisma 5, TypeScript, Tailwind, `jsonwebtoken`, `uuid`, Vitest (unit tests). Node ≥ 18.

---

## File Structure

```
lock-app/
  package.json                 # deps + scripts (mirrors middleware/client-portal)
  tsconfig.json                # @/* path alias
  next.config.js
  .env.example
  vitest.config.ts             # unit test runner
  prisma/
    schema.prisma              # SUPERSET schema (shared + lock-app tables)
    seed.ts                    # seed default roles
  src/
    lib/
      db.ts                    # Prisma singleton
      permissions.ts           # permission catalog + hasPermission()  ← unit-tested
      permissions.test.ts
      auth.ts                  # magic link + session (reused pattern)
      rbac.ts                  # requireAuth / requirePermission (server helpers)
    app/
      layout.tsx               # root layout
      globals.css              # Tailwind + Stayable tokens
      page.tsx                 # redirects to /overview or /login
      login/page.tsx           # email -> magic link request
```

**Decisions locked here (deferred in spec §8):**
- **Lock health** lives as columns on `LockMap` (it is already the per-lock record).
- **Occupancy** lives in a new `RoomState` table keyed `(propertyId, roomId)`.
- The lock-app schema is the **canonical superset**; the three shared tables must stay byte-identical in shape to `middleware/prisma/schema.prisma` (intentional duplication, same discipline as the MCP client/tools pair). Migrations run from `lock-app`.

---

## Task 1: Scaffold the lock-app Next.js project

**Files:**
- Create: `lock-app/package.json`
- Create: `lock-app/tsconfig.json`
- Create: `lock-app/next.config.js`
- Create: `lock-app/.env.example`
- Create: `lock-app/src/app/globals.css`
- Create: `lock-app/src/app/layout.tsx`
- Create: `lock-app/src/app/page.tsx`

- [ ] **Step 1: Create `lock-app/package.json`**

```json
{
  "name": "stayable-lock-app",
  "version": "0.1.0",
  "private": true,
  "description": "Role-based TTLock management UI — RISE8 / Stayable",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "postinstall": "prisma generate",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@prisma/client": "^5.10.0",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/uuid": "^9.0.7",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.2.0",
    "prisma": "^5.10.0",
    "tsx": "^4.7.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^1.3.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Create `lock-app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `lock-app/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
```

- [ ] **Step 4: Create `lock-app/.env.example`**

```dotenv
# Shared Neon DB (same instance as the middleware). Pull from Vercel:
#   vercel env pull .env.local
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# Auth
JWT_SECRET=
MAGIC_LINK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# SMTP (magic-link email) — same vars as client-portal
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- [ ] **Step 5: Create `lock-app/src/app/globals.css`** (Stayable tokens)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --navy: #041E42;
  --gold: #FDDA24;
}
body { background: #fff; color: var(--navy); }
```

- [ ] **Step 6: Create `lock-app/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stayable Lock App",
  description: "TTLock management — RISE8 / Stayable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `lock-app/src/app/page.tsx`** (placeholder root)

```tsx
export default function Home() {
  return <main style={{ padding: 24 }}>Stayable Lock App — foundation</main>;
}
```

- [ ] **Step 8: Install and verify the scaffold builds**

Run: `cd lock-app && npm install && npm run typecheck`
Expected: install succeeds; `tsc --noEmit` exits 0 with no output.

- [ ] **Step 9: Commit**

```bash
git add lock-app/package.json lock-app/tsconfig.json lock-app/next.config.js lock-app/.env.example lock-app/src/app
git commit -m "Scaffold lock-app (Next 14 + TS + Tailwind)"
```

---

## Task 2: Tailwind config

**Files:**
- Create: `lock-app/tailwind.config.ts`
- Create: `lock-app/postcss.config.js`

- [ ] **Step 1: Create `lock-app/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { navy: "#041E42", gold: "#FDDA24" },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Create `lock-app/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; the `/` route is listed.

- [ ] **Step 4: Commit**

```bash
git add lock-app/tailwind.config.ts lock-app/postcss.config.js
git commit -m "Add Tailwind config to lock-app"
```

---

## Task 3: Prisma superset schema

**Files:**
- Create: `lock-app/prisma/schema.prisma`
- Modify: `middleware/prisma/schema.prisma:30-44` (add `type` to `Passcode`, make `reservationId` nullable — keep the two shared definitions in sync)

- [ ] **Step 1: Create `lock-app/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}

// ---------- SHARED with middleware (keep definitions in sync) ----------

model LockMap {
  id         String   @id @default(cuid())
  propertyId String
  roomId     String
  lockId     BigInt
  alias      String?
  // lock health (lock-app additions; polled by Plan 4 cron)
  online     Boolean  @default(true)
  battery    Int? // 0-100
  lastSeen   DateTime?
  model      String?
  gatewayId  BigInt?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([propertyId, roomId])
}

model Passcode {
  id            String   @id @default(cuid())
  reservationId String? // nullable: backup/manual codes have no reservation
  propertyId    String
  roomId        String
  lockId        BigInt
  keyboardPwdId BigInt
  pin           String
  startTs       BigInt
  endTs         BigInt
  status        String // active | revoked | failed
  type          String   @default("guest") // guest | backup | manual
  createdAt     DateTime @default(now())

  @@index([reservationId])
}

model EventLog {
  id          String   @id @default(cuid())
  source      String // webhook | admin | field | cron | ttlock-push
  event       String
  propertyId  String?
  roomId      String?
  lockId      BigInt?
  action      String
  // actor (lock-app additions; null for system events)
  actorUserId String?
  actorEmail  String?
  actorRole   String?
  detail      Json?
  createdAt   DateTime @default(now())
}

// ---------- LOCK-APP OWN TABLES ----------

model User {
  id         String   @id @default(cuid())
  email      String   @unique
  name       String
  roleId     String
  role       Role     @relation(fields: [roleId], references: [id])
  scopeType  String   @default("property") // all | group | property
  propertyIds String[] @default([]) // when scopeType = property
  groupId    String?  // when scopeType = group
  createdAt  DateTime @default(now())

  sessions   Session[]
  magicLinks MagicLink[]
}

model Role {
  id          String   @id @default(cuid())
  name        String   @unique
  permissions String[] @default([])
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  users       User[]
}

model PropertyGroup {
  id          String   @id @default(cuid())
  name        String   @unique
  propertyIds String[] @default([])
}

model MagicLink {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  used      Boolean  @default(false)
  expiresAt DateTime
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model RoomState {
  id                  String   @id @default(cuid())
  propertyId          String
  roomId              String
  occupancyStatus     String   @default("free") // free | reserved | occupied
  currentReservationId String?
  guestName           String?
  checkoutDate        String?
  updatedAt           DateTime @updatedAt

  @@unique([propertyId, roomId])
}

model TtlockToken {
  id           String   @id @default(cuid())
  accessToken  String
  refreshToken String
  uid          BigInt
  expiresAt    BigInt // unix ms
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 2: Mirror the shared-table changes into the middleware schema**

In `middleware/prisma/schema.prisma`, update the `Passcode` model to match (add `type`, make `reservationId` optional) and add the health columns to `LockMap`. Replace the `Passcode` model with:

```prisma
model Passcode {
  id            String   @id @default(cuid())
  reservationId String?
  propertyId    String
  roomId        String
  lockId        BigInt
  keyboardPwdId BigInt
  pin           String
  startTs       BigInt
  endTs         BigInt
  status        String
  type          String   @default("guest")
  createdAt     DateTime @default(now())

  @@index([reservationId])
}
```

And add to the `LockMap` model (after `alias`):

```prisma
  online     Boolean   @default(true)
  battery    Int?
  lastSeen   DateTime?
  model      String?
  gatewayId  BigInt?
```

- [ ] **Step 3: Generate the client and verify both schemas are valid**

Run:
```bash
cd lock-app && npx prisma generate
cd ../middleware && npx prisma generate
```
Expected: both print "Generated Prisma Client". (Validation of env happens at `db push`; generate only needs the schema to parse.)

- [ ] **Step 4: Commit**

```bash
git add lock-app/prisma/schema.prisma middleware/prisma/schema.prisma
git commit -m "Add lock-app superset Prisma schema; mirror Passcode.type + lock health to middleware"
```

---

## Task 4: Prisma client singleton

**Files:**
- Create: `lock-app/src/lib/db.ts`

- [ ] **Step 1: Create `lock-app/src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
```

- [ ] **Step 2: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/lib/db.ts
git commit -m "Add Prisma client singleton to lock-app"
```

---

## Task 5: Permission catalog + hasPermission (TDD)

**Files:**
- Create: `lock-app/vitest.config.ts`
- Create: `lock-app/src/lib/permissions.ts`
- Test: `lock-app/src/lib/permissions.test.ts`

- [ ] **Step 1: Create `lock-app/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Write the failing test `lock-app/src/lib/permissions.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd lock-app && npx vitest run src/lib/permissions.test.ts`
Expected: FAIL — `Cannot find module './permissions'`.

- [ ] **Step 4: Create `lock-app/src/lib/permissions.ts`**

```ts
/**
 * Permission catalog + check. Roles are data-driven (DB records holding a subset
 * of these strings) — see the design spec §7. A user's effective access is the
 * intersection of their role's permissions and their assigned property scope.
 */
export const PERMISSIONS = [
  "rooms.view",
  "guest_code.reveal",
  "guest_code.revoke",
  "guest_code.generate_manual",
  "backup_code.reveal",
  "backup_code.rotate",
  "lock.sync",
  "devices.view",
  "lock.mark_registered",
  "mapping.edit",
  "activity.view",
  "activity.export",
  "users.manage",
  "roles.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface ActorPermissions {
  permissions: readonly string[];
  scopeType: "all" | "group" | "property";
  /** Properties the actor may act on when scopeType !== "all". */
  propertyIds: readonly string[];
}

/** Is `propertyId` within the actor's scope? `all` scope is unrestricted. */
function inScope(actor: ActorPermissions, propertyId?: string): boolean {
  if (actor.scopeType === "all") return true;
  if (!propertyId) return true; // global/portfolio view: scope applies per-row later
  return actor.propertyIds.includes(propertyId);
}

/** Does the actor hold `permission`, and (if given) for `propertyId`? */
export function hasPermission(
  actor: ActorPermissions,
  permission: Permission,
  propertyId?: string,
): boolean {
  if (!actor.permissions.includes(permission)) return false;
  return inScope(actor, propertyId);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd lock-app && npx vitest run src/lib/permissions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lock-app/vitest.config.ts lock-app/src/lib/permissions.ts lock-app/src/lib/permissions.test.ts
git commit -m "Add permission catalog + hasPermission (TDD)"
```

---

## Task 6: Auth library (magic link + session)

**Files:**
- Create: `lock-app/src/lib/auth.ts`

This mirrors `client-portal/src/lib/auth.ts` but reads the lock-app `User`/`Role`
relation so the session carries the user's permissions.

- [ ] **Step 1: Create `lock-app/src/lib/auth.ts`**

```ts
import { cookies } from "next/headers";
import { prisma } from "./db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleName: string;
  permissions: string[];
  scopeType: "all" | "group" | "property";
  propertyIds: string[];
}

export async function createMagicLink(email: string): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.magicLink.create({
    data: { email, token, expiresAt, userId: user?.id ?? null },
  });
  return token;
}

export async function verifyMagicLink(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const link = await prisma.magicLink.findUnique({ where: { token } });
  if (!link) return { success: false, error: "Invalid link" };
  if (link.used) return { success: false, error: "Link already used" };
  if (link.expiresAt < new Date()) return { success: false, error: "Link expired" };
  if (!link.userId) return { success: false, error: "User not found" };

  await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });

  const sessionToken = jwt.sign({ userId: link.userId }, JWT_SECRET, { expiresIn: "8h" });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h per spec §10 (old) / internal ops

  await prisma.session.create({
    data: { userId: link.userId, token: sessionToken, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return { success: true };
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  if (!sessionToken) return null;
  try {
    jwt.verify(sessionToken, JWT_SECRET);
  } catch {
    return null;
  }
  const session = await prisma.session.findFirst({
    where: { token: sessionToken, expiresAt: { gt: new Date() } },
    include: { user: { include: { role: true } } },
  });
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleName: u.role.name,
    permissions: u.role.permissions,
    scopeType: u.scopeType as SessionUser["scopeType"],
    propertyIds: u.propertyIds,
  };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookieStore.delete("session");
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/lib/auth.ts
git commit -m "Add lock-app magic-link auth (role-aware session)"
```

---

## Task 7: RBAC server helpers

**Files:**
- Create: `lock-app/src/lib/rbac.ts`

- [ ] **Step 1: Create `lock-app/src/lib/rbac.ts`**

```ts
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/lib/rbac.ts
git commit -m "Add RBAC server helpers (requireAuth / requirePermission)"
```

---

## Task 8: Seed default roles

**Files:**
- Create: `lock-app/prisma/seed.ts`

- [ ] **Step 1: Create `lock-app/prisma/seed.ts`**

```ts
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
```

- [ ] **Step 2: Push the schema and seed (requires `.env.local` with Neon vars)**

Run:
```bash
cd lock-app
# vercel env pull .env.local   # if not already present
npx prisma db push
npm run db:seed
```
Expected: `db push` reports the new tables/columns created; seed prints "Seeded 3 roles."

> If `DATABASE_URL` is not configured locally, this step is deferred to the
> machine that has it (the sandbox cannot reach Neon). Typecheck/build do not
> require it.

- [ ] **Step 3: Commit**

```bash
git add lock-app/prisma/seed.ts
git commit -m "Add default-role seed (super_admin / manager / attendant)"
```

---

## Task 9: Login page + magic-link request route

**Files:**
- Create: `lock-app/src/app/login/page.tsx`
- Create: `lock-app/src/app/api/auth/request/route.ts`
- Create: `lock-app/src/app/api/auth/verify/route.ts`
- Modify: `lock-app/src/app/page.tsx`

- [ ] **Step 1: Create the magic-link request route `lock-app/src/app/api/auth/request/route.ts`**

```ts
import { createMagicLink } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 });

  // Always 200 (don't leak which emails exist). Only mint a link for known users.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createMagicLink(email);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
    // Plan 1 stub: log the link. Plan 5 wires nodemailer (reuse client-portal/email.ts).
    console.log(`[magic-link] ${email} -> ${url}`);
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Create the verify route `lock-app/src/app/api/auth/verify/route.ts`**

```ts
import { verifyMagicLink } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = await verifyMagicLink(token);
  const dest = result.success ? "/" : `/login?error=${encodeURIComponent(result.error ?? "failed")}`;
  return Response.redirect(new URL(dest, process.env.NEXT_PUBLIC_APP_URL), 302);
}
```

- [ ] **Step 3: Create the login page `lock-app/src/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#041E42", color: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
        <div style={{ color: "#FDDA24", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>
        {sent ? (
          <p>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={submit}>
            <label style={{ fontSize: 12 }}>Work email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 10, margin: "8px 0 16px", borderRadius: 6, border: "none" }}
            />
            <button
              type="submit"
              style={{ width: "100%", padding: 12, background: "#FDDA24", color: "#041E42", border: "none", borderRadius: 6, fontWeight: 700 }}
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Update `lock-app/src/app/page.tsx` to gate on session**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <main style={{ padding: 24 }}>
      <h1>Signed in as {user.email}</h1>
      <p>Role: {user.roleName} · scope: {user.scopeType}</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd lock-app && npm run build`
Expected: build completes; routes `/login`, `/api/auth/request`, `/api/auth/verify`, `/` are listed.

- [ ] **Step 6: Commit**

```bash
git add lock-app/src/app/login lock-app/src/app/api/auth lock-app/src/app/page.tsx
git commit -m "Add login page + magic-link request/verify routes (email stubbed)"
```

---

## Self-Review

**Spec coverage (Foundation slice of §2, §7, §8):**
- §2 stack/auth/shared-DB → Tasks 1–4, 6. ✓
- §7 permission catalog + data-driven roles + scope → Tasks 5, 8; `Role`/`User`/`PropertyGroup` in Task 3. ✓
- §8 data model (Passcode.type nullable reservation, lock health, RoomState, TtlockToken, enriched EventLog, User/Role) → Task 3. ✓
- Mirroring shared tables to middleware → Task 3 Step 2. ✓
- Screens, room/door views, codes, crons, activity-log UI → **out of scope for Foundation**; covered by Plans 2–5.

**Placeholder scan:** Email send is explicitly stubbed (Task 9 Step 1) with a named hand-off to Plan 5 — not a hidden TODO. `db push`/seed deferred to a machine with Neon access — flagged, not vague. No "TBD"/"handle edge cases" left.

**Type consistency:** `SessionUser` (auth.ts) → `ActorPermissions` (permissions.ts) bridged by `toActor` (rbac.ts); fields `permissions`/`scopeType`/`propertyIds` match across all three. `Permission` type from permissions.ts used by rbac.ts. Schema `Passcode.type` default `"guest"` matches the middleware mirror.

---

## Notes for later plans
- **Plan 2 (Read surfaces):** app shell with the hybrid nav, Overview, Rooms grid (join `LockMap` + `RoomState` + active `Passcode`), Devices, Activity Log (search/filter/export reading `EventLog`).
- **Plan 3 (Code actions):** port the middleware's `ttlock.ts`/`cloudbeds.ts` reads as needed; door detail guest-code reveal/revoke/manual + **sync-from-lock** reconciliation (`listKeyboardPwd`); backup-code reveal/rotate writing `Passcode.type="backup"`.
- **Plan 4 (Background jobs):** Vercel Cron for health poll (writes `LockMap` health), occupancy reconcile (writes `RoomState`), TTLock token refresh (writes `TtlockToken`).
- **Plan 5 (Admin):** Users & Roles editor (`roles.manage`), mapping CRUD, Settings, and wiring nodemailer into the magic-link request route.
```
