# Lock-App Property-First Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `lock-app/` into a property-first flow — email-OTP login, a Portfolio picker → per-property Dashboard, a property-scoped sidebar, and a top bar with a profile menu + in-app notification bell.

**Architecture:** Next 14 App Router. Route groups split the two shells: `(app)/portfolio` (picker, top bar only) and `(app)/p/[propertyId]/*` (adds the property sidebar via a nested layout). All view logic lives in pure `src/lib/*.ts` modules (TDD with vitest); pages do Prisma reads and feed plain objects in. Auth swaps the magic-link URL for a 6-digit OTP, reusing the `MagicLink` table and the existing 8h session JWT.

**Tech Stack:** Next.js 14, React 18, Prisma 5 (Neon Postgres), vitest, TypeScript. `jsonwebtoken` for sessions, `uuid` retained for session ids elsewhere.

## Global Constraints

- Property IDs are the **real Cloudbeds IDs** (e.g. `210972` = Lakeland), never street codes. Source: `src/lib/properties.ts`.
- Brand colors: navy `#041E42`, gold `#FDDA24`. Status: green `#2e7d32`, amber `#b9770e`, red `#c0392b`.
- Low-battery threshold: **< 20%** (matches `lib/overview.ts`, `lib/rooms.ts`).
- All nav/actions stay **permission-gated** via `sessionCan(user, perm, propertyId)`; reuse the existing `PERMISSIONS` catalog — do not invent new permission strings.
- Pure libs are TDD'd; `npm run typecheck` and `npm run build` must be green before a task is done.
- Prisma CLI reads `.env` (not `.env.local`); `DATABASE_URL` for shared Neon is already there.
- No real email/SMS sending and no Alerts engine in this plan (deferred). OTP codes and magic links are logged to console only.

---

## File Structure

**Create:**
- `src/lib/otp.ts` + `src/lib/otp.test.ts` — pure 6-digit code generation + match.
- `src/lib/dashboard.ts` + `src/lib/dashboard.test.ts` — KPI + "My Actions" derivation.
- `src/lib/notifications.ts` + `src/lib/notifications.test.ts` — bell unseen-count + recent list.
- `src/app/(app)/p/[propertyId]/layout.tsx` — property-scoped shell (renders Sidebar).
- `src/app/(app)/p/[propertyId]/dashboard/page.tsx` — the Dashboard.
- `src/app/(app)/portfolio/page.tsx` — renamed/moved from `overview/page.tsx`.
- `src/app/(app)/profile-actions.ts` — server actions: save prefs, mark-seen, sign out.
- `src/components/TopBar.tsx` (server), `src/components/ProfileMenu.tsx` (client), `src/components/NotificationBell.tsx` (client).

**Modify:**
- `prisma/schema.prisma` — add `MagicLink.code`, `User.notificationPrefs`, `User.notificationsSeenAt`.
- `src/lib/auth.ts` — replace magic-link create/verify with OTP create/verify.
- `src/app/api/auth/request/route.ts` — generate + log OTP code.
- `src/app/api/auth/verify/route.ts` — POST `{email, code}` (was GET token).
- `src/app/login/page.tsx` — two-step email → code UI.
- `src/components/Sidebar.tsx` — property-scoped flat list.
- `src/app/(app)/layout.tsx` — drop sidebar; add top bar; keep auth.
- `src/app/page.tsx` — redirect `/` → `/portfolio`.
- `todo.md` — mark plan done, refresh RESUME pointer.

**Delete:**
- `src/app/(app)/overview/page.tsx` (moved to `portfolio/`).

---

## Task 1: Schema migration + OTP core lib

**Files:**
- Modify: `prisma/schema.prisma` (User + MagicLink models)
- Create: `src/lib/otp.ts`, `src/lib/otp.test.ts`

**Interfaces:**
- Produces: `generateOtpCode(): string` (6 digits), `otpMatches(stored: {code: string|null; used: boolean; expiresAt: Date}, input: string, now: Date): boolean`.

- [ ] **Step 1: Add schema fields**

In `prisma/schema.prisma`, add to `model MagicLink` (after `token`):
```prisma
  code      String?
```
Add to `model User` (after `createdAt`):
```prisma
  notificationPrefs   Json?
  notificationsSeenAt DateTime?
```

- [ ] **Step 2: Push schema to Neon + regenerate client**

Run: `npm run db:push`
Expected: "Your database is now in sync with your Prisma schema." and prisma generate runs.

- [ ] **Step 3: Write the failing test**

Create `src/lib/otp.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateOtpCode, otpMatches } from "./otp";

describe("generateOtpCode", () => {
  it("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe("otpMatches", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  const future = new Date("2026-06-23T12:10:00Z");
  const past = new Date("2026-06-23T11:50:00Z");

  it("accepts a matching, unused, unexpired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "123456", now)).toBe(true);
  });
  it("rejects a wrong code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: future }, "000000", now)).toBe(false);
  });
  it("rejects a used code", () => {
    expect(otpMatches({ code: "123456", used: true, expiresAt: future }, "123456", now)).toBe(false);
  });
  it("rejects an expired code", () => {
    expect(otpMatches({ code: "123456", used: false, expiresAt: past }, "123456", now)).toBe(false);
  });
  it("rejects a null stored code", () => {
    expect(otpMatches({ code: null, used: false, expiresAt: future }, "123456", now)).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/otp.test.ts`
Expected: FAIL — `./otp` not found.

- [ ] **Step 5: Implement `src/lib/otp.ts`**

```ts
/**
 * Pure OTP helpers for email-code login. The 6-digit code replaces the magic-link
 * URL token; storage/verification orchestration lives in lib/auth.ts. Constant-time
 * compare is not required here (codes are short-lived, single-use, server-checked).
 */
import { randomInt } from "crypto";

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpMatches(
  stored: { code: string | null; used: boolean; expiresAt: Date },
  input: string,
  now: Date,
): boolean {
  if (!stored.code || stored.used) return false;
  if (stored.expiresAt < now) return false;
  return stored.code === input.trim();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/otp.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/otp.ts src/lib/otp.test.ts
git commit -m "lock-app: OTP schema fields + pure OTP code lib"
```

---

## Task 2: OTP auth wiring (lib + routes + login UI)

**Files:**
- Modify: `src/lib/auth.ts`, `src/app/api/auth/request/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `generateOtpCode`, `otpMatches` (Task 1).
- Produces: `createOtp(email: string): Promise<void>`, `verifyOtp(email: string, code: string): Promise<{success: boolean; error?: string}>`. (`getSession`, `logout` unchanged.)

- [ ] **Step 1: Replace magic-link fns in `src/lib/auth.ts`**

Remove `createMagicLink` and `verifyMagicLink`. Add (keep imports for `otp`):
```ts
import { generateOtpCode, otpMatches } from "./otp";
```
```ts
export async function createOtp(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // don't leak which emails exist
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.magicLink.create({
    data: { email, token: uuidv4(), code, expiresAt, userId: user.id },
  });
  // Plan-5 wires real email. For now, log the code.
  console.log(`[otp] ${email} -> ${code}`);
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const link = await prisma.magicLink.findFirst({
    where: { email, used: false },
    orderBy: { createdAt: "desc" },
  });
  if (!link || !link.userId) return { success: false, error: "Invalid code" };
  if (!otpMatches({ code: link.code, used: link.used, expiresAt: link.expiresAt }, code, new Date())) {
    return { success: false, error: "Invalid or expired code" };
  }
  await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });

  const sessionToken = jwt.sign({ userId: link.userId }, JWT_SECRET, { expiresIn: "8h" });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: link.userId, token: sessionToken, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set("session", sessionToken, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", expires: expiresAt, path: "/",
  });
  return { success: true };
}
```

- [ ] **Step 2: Update `src/app/api/auth/request/route.ts`**

```ts
import { createOtp } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 });
  await createOtp(email); // always 200; only mints for known users
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Replace `src/app/api/auth/verify/route.ts` with a POST**

```ts
import { verifyOtp } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email, code } = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  if (!email || !code) return Response.json({ ok: false, error: "email and code required" }, { status: 400 });
  const result = await verifyOtp(email, code);
  if (!result.success) return Response.json({ ok: false, error: result.error }, { status: 401 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Two-step login UI — `src/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [error, setError] = useState("");

  const input = { width: "100%", padding: 10, margin: "8px 0 16px", borderRadius: 6, border: "none", background: "#fff", color: "#041E42" } as const;
  const button = { width: "100%", padding: 12, background: "#FDDA24", color: "#041E42", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" } as const;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setStage("code");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
    if (res.ok) router.push("/portfolio");
    else setError((await res.json().catch(() => ({}))).error ?? "Failed");
  }

  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#041E42", color: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
        <div style={{ color: "#FDDA24", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>
        {stage === "email" ? (
          <form onSubmit={sendCode}>
            <label style={{ fontSize: 12 }}>Work email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
            <button type="submit" style={button}>Send code</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label style={{ fontSize: 12 }}>6-digit code sent to {email}</label>
            <input inputMode="numeric" pattern="\d{6}" required value={code} onChange={(e) => setCode(e.target.value)} style={input} />
            <button type="submit" style={button}>Sign in</button>
            <button type="button" onClick={() => setStage("email")} style={{ ...button, background: "transparent", color: "#9bb", marginTop: 8, fontWeight: 400 }}>Use a different email</button>
          </form>
        )}
        {error && <p style={{ color: "#FDDA24", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck + manual smoke**

Run: `npm run typecheck`
Expected: no errors.
Manual: with dev server running, POST email to `/api/auth/request`, read the `[otp]` line from the server console, then on `/login` enter email → code. (No automated test — this is integration glue over the Task 1 unit-tested core.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth src/app/login/page.tsx
git commit -m "lock-app: email-OTP login replacing magic-link"
```

---

## Task 3: Routing & navigation restructure

**Files:**
- Create: `src/app/(app)/portfolio/page.tsx`, `src/app/(app)/p/[propertyId]/layout.tsx`
- Delete: `src/app/(app)/overview/page.tsx`
- Modify: `src/app/page.tsx`, `src/components/Sidebar.tsx`, `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `requireUserOrRedirect`, `userProperties`, `sessionCan` (existing), `getProperty` (existing).
- Produces: property layout passing `currentProperty` to `<Sidebar>`; `/portfolio` route.

- [ ] **Step 1: Root redirect — `src/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/portfolio");
}
```

- [ ] **Step 2: Move Overview → Portfolio**

Create `src/app/(app)/portfolio/page.tsx` as a copy of the current `overview/page.tsx` with two changes: the card `href` becomes `/p/${c.propertyId}/dashboard` (was `/rooms`), and the `<h1>` text becomes `Portfolio`. Full file:
```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, userProperties } from "@/lib/session-access";
import { summarizeProperty } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUserOrRedirect();
  const props = userProperties(user);
  const locks = await prisma.lockMap.findMany({
    where: { propertyId: { in: props.map((p) => p.id) } },
    select: { propertyId: true, online: true, battery: true },
  });
  const cards = props.map((p) =>
    summarizeProperty(p, locks.filter((l) => l.propertyId === p.id).map((l) => ({ online: l.online, battery: l.battery }))),
  );
  return (
    <div>
      <h1 style={{ color: "#041E42" }}>Portfolio</h1>
      <p style={{ color: "#456" }}>Choose a property to manage — {props.length} in your scope.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
        {cards.map((c) => (
          <Link key={c.propertyId} href={`/p/${c.propertyId}/dashboard`} style={{ textDecoration: "none" }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 10, padding: 16, color: "#041E42" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{c.name}</div>
              <div style={{ fontSize: 13 }}>{c.totalLocks} locks · {c.online} online</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: c.offline ? "#c0392b" : "#2e7d32" }}>{c.offline} offline</span>
                <span style={{ color: c.lowBattery ? "#b9770e" : "#2e7d32" }}>{c.lowBattery} low battery</span>
              </div>
              <div style={{ marginTop: 10, fontWeight: 700, color: c.needsAttention ? "#c0392b" : "#2e7d32" }}>
                {c.needsAttention ? `${c.needsAttention} need attention` : "All clear"}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {props.length === 0 && <p>No properties are in your scope.</p>}
    </div>
  );
}
```
Then delete `src/app/(app)/overview/page.tsx`.

- [ ] **Step 3: Property-scoped layout — `src/app/(app)/p/[propertyId]/layout.tsx`**

```tsx
import { requireUserOrRedirect } from "@/lib/session-access";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { propertyId: string };
}) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flex: 1 }}>
      <Sidebar user={user} currentProperty={params.propertyId} />
      <div style={{ flex: 1, padding: 24 }}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Property-scoped Sidebar — `src/components/Sidebar.tsx`**

```tsx
import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";

/** Property-scoped flat nav: property header, the property pages, then a link back
 *  to the Portfolio picker. Admin links (Settings/Users) pinned at the bottom. */
export default function Sidebar({ user, currentProperty }: { user: SessionUser; currentProperty: string }) {
  const p = currentProperty;
  const property = getProperty(p);
  const navLink = { display: "block", padding: "6px 0", color: "#fff", textDecoration: "none" } as const;
  return (
    <nav style={{ width: 220, background: "#041E42", color: "#fff", padding: 16, boxSizing: "border-box" }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>🏠 {property?.name ?? "Property"}</div>
      <div style={{ color: "#9bb", fontSize: 11, marginBottom: 16 }}>Stayable</div>

      <Link href={`/p/${p}/dashboard`} style={navLink}>Dashboard</Link>
      <Link href={`/p/${p}/alerts`} style={navLink}>Alerts</Link>
      {sessionCan(user, "rooms.view", p) && <Link href={`/p/${p}/rooms`} style={navLink}>Rooms</Link>}
      {sessionCan(user, "devices.view", p) && <Link href={`/p/${p}/devices`} style={navLink}>Devices</Link>}
      {sessionCan(user, "activity.view", p) && <Link href={`/p/${p}/activity`} style={navLink}>Activity Log</Link>}

      <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
      <Link href="/portfolio" style={{ ...navLink, color: "#FDDA24" }}>← Portfolio</Link>

      {(sessionCan(user, "settings.manage") || sessionCan(user, "users.manage")) && (
        <>
          <hr style={{ borderColor: "#1d3557", margin: "12px 0" }} />
          {sessionCan(user, "settings.manage") && <Link href="/settings" style={navLink}>Settings</Link>}
          {sessionCan(user, "users.manage") && <Link href="/users" style={navLink}>Users</Link>}
        </>
      )}
    </nav>
  );
}
```
Note: the `Alerts` link now points to `/p/${p}/alerts` (per-property). The existing placeholder lives at `(app)/alerts`; move it in Step 5.

- [ ] **Step 5: Move the Alerts placeholder under the property**

Move `src/app/(app)/alerts/page.tsx` → `src/app/(app)/p/[propertyId]/alerts/page.tsx` (same content; it's a Plan-4 placeholder). Remove the now-empty `(app)/alerts/` dir.

- [ ] **Step 6: Reduce `(app)/layout.tsx` (sidebar now lives in the property layout)**

```tsx
import { requireUserOrRedirect } from "@/lib/session-access";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#fff" }}>
      {/* @ts-expect-error Async Server Component */}
      <TopBar user={user} />
      <div style={{ display: "flex", flex: 1 }}>{children}</div>
    </div>
  );
}
```
`TopBar` is created in Task 7. Until then, temporarily replace the `<TopBar .../>` line with `{/* TopBar added in Task 7 */}` so this task builds; re-add in Task 7 Step 6.

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success. (With the TopBar line stubbed out per Step 6.)

- [ ] **Step 8: Commit**

```bash
git add src/app src/components/Sidebar.tsx
git commit -m "lock-app: property-first routing — Portfolio picker, property layout + sidebar"
```

---

## Task 4: Dashboard view-model lib

**Files:**
- Create: `src/lib/dashboard.ts`, `src/lib/dashboard.test.ts`

**Interfaces:**
- Produces: `buildDashboard(input: DashboardInput): Dashboard` where
  `DashboardInput = { locks: LockRow[]; states: StateRow[]; activeGuestRoomIds: string[]; doorOpenRoomIds: string[] }`,
  `Dashboard = { kpis: DashKpis; actions: DashAction[] }`.

- [ ] **Step 1: Write the failing test — `src/lib/dashboard.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildDashboard } from "./dashboard";

const locks = [
  { roomId: "101", online: true, battery: 92 },
  { roomId: "102", online: true, battery: 14 }, // low
  { roomId: "103", online: false, battery: 60 }, // offline
];
const states = [
  { roomId: "101", occupancyStatus: "occupied" as const },
  { roomId: "102", occupancyStatus: "reserved" as const },
  { roomId: "103", occupancyStatus: "free" as const },
];

describe("buildDashboard", () => {
  it("computes KPI counts", () => {
    const { kpis } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: [] });
    expect(kpis).toMatchObject({ totalLocks: 3, online: 2, offline: 1, lowBattery: 1, occupied: 1, vacant: 2 });
  });

  it("raises actions for offline, low battery, and occupied/reserved rooms without a guest code", () => {
    const { actions } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: [] });
    const kinds = actions.map((a) => `${a.kind}:${a.roomId}`);
    expect(kinds).toContain("offline:103");
    expect(kinds).toContain("low_battery:102");
    expect(kinds).toContain("no_guest_code:102"); // reserved, no active guest pin
    expect(kinds).not.toContain("no_guest_code:101"); // occupied but has a pin
    expect(kinds).not.toContain("no_guest_code:103"); // free -> no code expected
  });

  it("raises a critical door-left-open action", () => {
    const { actions } = buildDashboard({ locks, states, activeGuestRoomIds: ["101"], doorOpenRoomIds: ["101"] });
    const door = actions.find((a) => a.kind === "door_left_open");
    expect(door).toMatchObject({ roomId: "101", severity: "critical" });
  });

  it("is all-clear with healthy, coded, occupied rooms", () => {
    const { actions } = buildDashboard({
      locks: [{ roomId: "101", online: true, battery: 90 }],
      states: [{ roomId: "101", occupancyStatus: "occupied" }],
      activeGuestRoomIds: ["101"], doorOpenRoomIds: [],
    });
    expect(actions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — `./dashboard` not found.

- [ ] **Step 3: Implement `src/lib/dashboard.ts`**

```ts
/**
 * Pure view-model for the per-property Dashboard: KPI counts + a "My Actions" feed.
 * No zones / no room grid (by design). The page does the Prisma reads (locks,
 * room states, active guest passcodes, recent door-left-open events) and feeds
 * plain arrays in here. Alert *records* arrive with the Alerts engine; until then
 * these are derived at request time.
 */
export type Occupancy = "free" | "reserved" | "occupied";
export type ActionKind = "offline" | "low_battery" | "no_guest_code" | "door_left_open";

const LOW_BATTERY_PCT = 20;

export interface LockRow { roomId: string; online: boolean; battery: number | null; }
export interface StateRow { roomId: string; occupancyStatus: Occupancy; }

export interface DashKpis {
  totalLocks: number; online: number; offline: number; lowBattery: number;
  occupied: number; vacant: number;
}
export interface DashAction {
  kind: ActionKind; roomId: string; label: string; severity: "warning" | "critical";
}
export interface DashboardInput {
  locks: LockRow[]; states: StateRow[];
  activeGuestRoomIds: string[]; doorOpenRoomIds: string[];
}
export interface Dashboard { kpis: DashKpis; actions: DashAction[]; }

export function buildDashboard(input: DashboardInput): Dashboard {
  const { locks, states, activeGuestRoomIds, doorOpenRoomIds } = input;
  const hasGuestCode = new Set(activeGuestRoomIds);
  const occByRoom = new Map(states.map((s) => [s.roomId, s.occupancyStatus]));

  let online = 0, offline = 0, lowBattery = 0;
  const actions: DashAction[] = [];
  for (const l of locks) {
    const low = l.battery != null && l.battery < LOW_BATTERY_PCT;
    if (l.online) online++; else { offline++; actions.push({ kind: "offline", roomId: l.roomId, label: `Lock offline in room ${l.roomId}`, severity: "critical" }); }
    if (low) { lowBattery++; actions.push({ kind: "low_battery", roomId: l.roomId, label: `Low battery (${l.battery}%) in room ${l.roomId}`, severity: "warning" }); }
  }

  let occupied = 0;
  for (const s of states) if (s.occupancyStatus === "occupied") occupied++;

  for (const [roomId, occ] of occByRoom) {
    if ((occ === "occupied" || occ === "reserved") && !hasGuestCode.has(roomId)) {
      actions.push({ kind: "no_guest_code", roomId, label: `No active guest code in room ${roomId}`, severity: "warning" });
    }
  }
  for (const roomId of doorOpenRoomIds) {
    actions.push({ kind: "door_left_open", roomId, label: `Door left open in room ${roomId}`, severity: "critical" });
  }

  return {
    kpis: { totalLocks: locks.length, online, offline, lowBattery, occupied, vacant: states.length - occupied },
    actions,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "lock-app: dashboard view-model (KPIs + My Actions, no zones)"
```

---

## Task 5: Dashboard page

**Files:**
- Create: `src/app/(app)/p/[propertyId]/dashboard/page.tsx`

**Interfaces:**
- Consumes: `buildDashboard` (Task 4), `getProperty`, `requireUserOrRedirect`, `sessionCan`, Prisma models `lockMap`, `roomState`, `passcode`, `eventLog`.

- [ ] **Step 1: Implement the page**

```tsx
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { buildDashboard, type Occupancy } from "@/lib/dashboard";
import Forbidden from "@/components/Forbidden";

export const dynamic = "force-dynamic";

const SEV_COLOR = { critical: "#c0392b", warning: "#b9770e" } as const;

export default async function DashboardPage({ params }: { params: { propertyId: string } }) {
  const user = await requireUserOrRedirect();
  const { propertyId } = params;
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this property" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [locks, states, guestPins, doorEvents] = await Promise.all([
    prisma.lockMap.findMany({ where: { propertyId }, select: { roomId: true, online: true, battery: true } }),
    prisma.roomState.findMany({ where: { propertyId }, select: { roomId: true, occupancyStatus: true } }),
    prisma.passcode.findMany({ where: { propertyId, status: "active", type: "guest" }, select: { roomId: true } }),
    prisma.eventLog.findMany({ where: { propertyId, action: "door_left_open", createdAt: { gt: since } }, select: { roomId: true } }),
  ]);

  const { kpis, actions } = buildDashboard({
    locks: locks.map((l) => ({ roomId: l.roomId, online: l.online, battery: l.battery })),
    states: states.map((s) => ({ roomId: s.roomId, occupancyStatus: s.occupancyStatus as Occupancy })),
    activeGuestRoomIds: guestPins.map((p) => p.roomId),
    doorOpenRoomIds: doorEvents.map((e) => e.roomId).filter((r): r is string => !!r),
  });

  const KPIS: [string, number, string][] = [
    ["Locks", kpis.totalLocks, "#041E42"], ["Online", kpis.online, "#2e7d32"],
    ["Offline", kpis.offline, kpis.offline ? "#c0392b" : "#2e7d32"],
    ["Low battery", kpis.lowBattery, kpis.lowBattery ? "#b9770e" : "#2e7d32"],
    ["Occupied", kpis.occupied, "#041E42"], ["Vacant", kpis.vacant, "#041E42"],
  ];

  return (
    <div>
      <h1 style={{ color: "#041E42" }}>{property.name} — Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, margin: "16px 0" }}>
        {KPIS.map(([label, value, color]) => (
          <div key={label} style={{ border: "1px solid #d7dde6", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 13, color: "#456" }}>{label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ color: "#041E42", fontSize: 18 }}>My Actions</h2>
      {actions.length === 0 ? (
        <p style={{ color: "#2e7d32" }}>All clear — nothing needs attention.</p>
      ) : (
        <div style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden" }}>
          {actions.map((a, i) => (
            <a key={`${a.kind}-${a.roomId}-${i}`} href={`/p/${propertyId}/rooms/${a.roomId}`}
               style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderTop: i ? "1px solid #eef" : "none", textDecoration: "none", color: "#041E42" }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: SEV_COLOR[a.severity] }} />
              <span>{a.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success. (`door_left_open` events may be absent in the dev seed — the panel still renders offline/low-battery/no-code actions from the seeded Lakeland data.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/p/[propertyId]/dashboard/page.tsx"
git commit -m "lock-app: per-property Dashboard page (KPIs + My Actions)"
```

---

## Task 6: Notifications view-model lib

**Files:**
- Create: `src/lib/notifications.ts`, `src/lib/notifications.test.ts`

**Interfaces:**
- Produces: `isAlertEvent(outcome: string | undefined): boolean`, `unseenCount(items: NotificationItem[], seenAt: Date | null): number`, `recentNotifications(items: NotificationItem[], limit: number): NotificationItem[]`, type `NotificationItem = { id: string; message: string; outcome: "warning" | "failed"; createdAt: Date; roomId: string | null; propertyId: string }`.

- [ ] **Step 1: Write the failing test — `src/lib/notifications.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isAlertEvent, unseenCount, recentNotifications, type NotificationItem } from "./notifications";

const mk = (id: string, ms: number, outcome: "warning" | "failed" = "warning"): NotificationItem =>
  ({ id, message: `m${id}`, outcome, createdAt: new Date(ms), roomId: "101", propertyId: "210972" });

describe("isAlertEvent", () => {
  it("flags warning and failed only", () => {
    expect(isAlertEvent("warning")).toBe(true);
    expect(isAlertEvent("failed")).toBe(true);
    expect(isAlertEvent("success")).toBe(false);
    expect(isAlertEvent(undefined)).toBe(false);
  });
});

describe("unseenCount", () => {
  const items = [mk("a", 3000), mk("b", 2000), mk("c", 1000)];
  it("counts items strictly newer than seenAt", () => {
    expect(unseenCount(items, new Date(1500))).toBe(2); // a,b
  });
  it("counts all when never seen", () => {
    expect(unseenCount(items, null)).toBe(3);
  });
  it("counts zero when seenAt is newest", () => {
    expect(unseenCount(items, new Date(3000))).toBe(0);
  });
});

describe("recentNotifications", () => {
  it("sorts newest first and caps at limit", () => {
    const out = recentNotifications([mk("c", 1000), mk("a", 3000), mk("b", 2000)], 2);
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: FAIL — `./notifications` not found.

- [ ] **Step 3: Implement `src/lib/notifications.ts`**

```ts
/**
 * Pure helpers for the in-app notification bell. Until the Alerts engine exists,
 * "notifications" are EventLog rows whose detail.outcome is warning|failed. The
 * page reads those rows (scoped to the user's properties) and the user's
 * notificationsSeenAt, then feeds plain objects in here. Delivery (email) is
 * deferred — this is read-only surfacing.
 */
export interface NotificationItem {
  id: string;
  message: string;
  outcome: "warning" | "failed";
  createdAt: Date;
  roomId: string | null;
  propertyId: string;
}

export function isAlertEvent(outcome: string | undefined): boolean {
  return outcome === "warning" || outcome === "failed";
}

export function unseenCount(items: NotificationItem[], seenAt: Date | null): number {
  if (!seenAt) return items.length;
  return items.filter((i) => i.createdAt > seenAt).length;
}

export function recentNotifications(items: NotificationItem[], limit: number): NotificationItem[] {
  return [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "lock-app: notifications view-model (bell unseen-count + recent list)"
```

---

## Task 7: Top bar — profile menu + notification bell + actions

**Files:**
- Create: `src/app/(app)/profile-actions.ts`, `src/components/TopBar.tsx`, `src/components/ProfileMenu.tsx`, `src/components/NotificationBell.tsx`
- Modify: `src/app/(app)/layout.tsx` (re-add `<TopBar>`)

**Interfaces:**
- Consumes: `getSession`/`logout` (auth), `userProperties`, `isAlertEvent`/`unseenCount`/`recentNotifications` (Task 6), Prisma `eventLog`/`user`.
- Produces: server actions `signOutAction()`, `markSeenAction()`, `saveNotificationPrefsAction(formData: FormData)`.

- [ ] **Step 1: Server actions — `src/app/(app)/profile-actions.ts`**

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, logout } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function signOutAction() {
  await logout();
  redirect("/login");
}

export async function markSeenAction() {
  const user = await getSession();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function saveNotificationPrefsAction(formData: FormData) {
  const user = await getSession();
  if (!user) return;
  const prefs = {
    offline: formData.get("offline") === "on",
    low_battery: formData.get("low_battery") === "on",
    door_left_open: formData.get("door_left_open") === "on",
    email: formData.get("email") === "on",
  };
  await prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Notification bell (client) — `src/components/NotificationBell.tsx`**

```tsx
"use client";
import { useState } from "react";
import { markSeenAction } from "@/app/(app)/profile-actions";

export interface BellItem { id: string; message: string; createdAt: string; outcome: string; }

export default function NotificationBell({ unseen, items }: { unseen: number; items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unseen > 0) void markSeenAction();
  }
  return (
    <div style={{ position: "relative" }}>
      <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, position: "relative" }}>
        🔔
        {unseen > 0 && (
          <span style={{ position: "absolute", top: -4, right: -6, background: "#c0392b", color: "#fff", borderRadius: 10, fontSize: 10, padding: "0 5px" }}>{unseen}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 28, width: 280, background: "#fff", border: "1px solid #d7dde6", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 20 }}>
          <div style={{ padding: 10, fontWeight: 700, color: "#041E42", borderBottom: "1px solid #eef" }}>Notifications</div>
          {items.length === 0 ? (
            <div style={{ padding: 12, color: "#456", fontSize: 13 }}>Nothing recent.</div>
          ) : items.map((it) => (
            <div key={it.id} style={{ padding: 10, borderBottom: "1px solid #f3f5f8", fontSize: 13 }}>
              <span style={{ color: it.outcome === "failed" ? "#c0392b" : "#b9770e" }}>●</span> {it.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Profile menu (client) — `src/components/ProfileMenu.tsx`**

```tsx
"use client";
import { useState } from "react";
import { signOutAction, saveNotificationPrefsAction } from "@/app/(app)/profile-actions";

export interface Prefs { offline: boolean; low_battery: boolean; door_left_open: boolean; email: boolean; }

export default function ProfileMenu({ name, role, prefs }: { name: string; role: string; prefs: Prefs }) {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const row = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "6px 0" } as const;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#041E42" }}>
        <span style={{ width: 28, height: 28, borderRadius: 28, background: "#041E42", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span style={{ fontWeight: 600 }}>{name}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 36, width: 260, background: "#fff", border: "1px solid #d7dde6", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 20, padding: 12 }}>
          <div style={{ fontWeight: 700, color: "#041E42" }}>{name}</div>
          <div style={{ color: "#456", fontSize: 12, marginBottom: 10 }}>{role}</div>
          <button onClick={() => setShowPrefs((s) => !s)} style={{ background: "none", border: "none", color: "#041E42", cursor: "pointer", padding: 0, fontSize: 13 }}>
            Notification settings {showPrefs ? "▴" : "▾"}
          </button>
          {showPrefs && (
            <form action={saveNotificationPrefsAction} style={{ margin: "8px 0", padding: 8, background: "#f7f9fc", borderRadius: 6 }}>
              <label style={row}><input type="checkbox" name="offline" defaultChecked={prefs.offline} /> Lock offline</label>
              <label style={row}><input type="checkbox" name="low_battery" defaultChecked={prefs.low_battery} /> Low battery</label>
              <label style={row}><input type="checkbox" name="door_left_open" defaultChecked={prefs.door_left_open} /> Door left open</label>
              <label style={row}><input type="checkbox" name="email" defaultChecked={prefs.email} /> Email me (when delivery ships)</label>
              <button type="submit" style={{ marginTop: 6, padding: "6px 12px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Save</button>
            </form>
          )}
          <hr style={{ border: "none", borderTop: "1px solid #eef", margin: "10px 0" }} />
          <form action={signOutAction}>
            <button type="submit" style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", padding: 0, fontSize: 13 }}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Top bar (server) — `src/components/TopBar.tsx`**

```tsx
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userProperties } from "@/lib/session-access";
import { isAlertEvent, unseenCount, recentNotifications, type NotificationItem } from "@/lib/notifications";
import NotificationBell from "./NotificationBell";
import ProfileMenu, { type Prefs } from "./ProfileMenu";

const DEFAULT_PREFS: Prefs = { offline: true, low_battery: true, door_left_open: true, email: false };

export default async function TopBar({ user }: { user: SessionUser }) {
  const propIds = userProperties(user).map((p) => p.id);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true, notificationsSeenAt: true } });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.eventLog.findMany({
    where: { propertyId: { in: propIds }, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  const items: NotificationItem[] = rows
    .filter((r) => isAlertEvent((r.detail as { outcome?: string } | null)?.outcome))
    .map((r) => ({
      id: r.id,
      message: (r.detail as { message?: string } | null)?.message ?? r.action,
      outcome: ((r.detail as { outcome?: string }).outcome) as "warning" | "failed",
      createdAt: r.createdAt, roomId: r.roomId, propertyId: r.propertyId,
    }));

  const unseen = unseenCount(items, dbUser?.notificationsSeenAt ?? null);
  const recent = recentNotifications(items, 8).map((i) => ({ id: i.id, message: i.message, outcome: i.outcome, createdAt: i.createdAt.toISOString() }));
  const prefs = { ...DEFAULT_PREFS, ...((dbUser?.notificationPrefs as Partial<Prefs> | null) ?? {}) };

  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #e3e8ef", background: "#fff" }}>
      <div style={{ color: "#FDDA24", background: "#041E42", padding: "4px 10px", borderRadius: 6, fontWeight: 800, letterSpacing: 1, fontSize: 13 }}>STAYABLE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <NotificationBell unseen={unseen} items={recent} />
        <ProfileMenu name={user.name} role={user.roleName} prefs={prefs} />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Re-add `<TopBar>` in `src/app/(app)/layout.tsx`**

Replace the `{/* TopBar added in Task 7 */}` placeholder from Task 3 Step 6 with:
```tsx
      {/* @ts-expect-error Async Server Component */}
      <TopBar user={user} />
```
and add the import: `import TopBar from "@/components/TopBar";`

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/profile-actions.ts" "src/app/(app)/layout.tsx" src/components/TopBar.tsx src/components/ProfileMenu.tsx src/components/NotificationBell.tsx
git commit -m "lock-app: top bar with profile menu + notification bell"
```

---

## Task 8: Integration verification + docs

**Files:**
- Modify: `todo.md`
- Possibly Delete: `src/components/PropertySwitcher.tsx` (only if now unused)

- [ ] **Step 1: Confirm PropertySwitcher is unused, then remove**

Run: `grep -rn "PropertySwitcher" src`
Expected: no references (Sidebar no longer imports it). If none, delete `src/components/PropertySwitcher.tsx`. If still referenced, leave it.

- [ ] **Step 2: Full test + typecheck + build**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all pass (existing suite + otp/dashboard/notifications tests).

- [ ] **Step 3: Manual smoke (dev server)**

With `npm run dev`: log in via OTP (read code from console) → land on `/portfolio` → click a property → `/p/<id>/dashboard` shows KPIs + actions → sidebar navigates Dashboard/Alerts/Rooms/Devices/Activity → `← Portfolio` returns → top-bar bell shows a count for Lakeland (seeded warning/failed events) → profile menu opens, save notification prefs, sign out.

- [ ] **Step 4: Update `todo.md`**

Mark the property-first restructure done; refresh the RESUME pointer to note: OTP login, Portfolio→Dashboard flow, property sidebar, top-bar profile + bell shipped; Alerts engine (Plan 4) + real email delivery still pending.

- [ ] **Step 5: Commit**

```bash
git add todo.md src/components
git commit -m "lock-app: finish property-first restructure — verification + todo"
```

---

## Self-Review

- **Spec coverage:** OTP auth (T1–T2) ✓ · Portfolio landing + property layout + flat sidebar + Settings/Users at bottom (T3) ✓ · Dashboard KPIs + Actions, no zones (T4–T5) ✓ · Top bar profile menu + bell, prefs save only (T6–T7) ✓ · schema changes (T1) ✓ · login input fix (already committed) ✓ · deferrals noted ✓.
- **Placeholder scan:** none — every step has concrete code/commands. The one intentional temporary stub (Task 3 Step 6) is explicitly resolved in Task 7 Step 5.
- **Type consistency:** `buildDashboard`/`DashboardInput`/`DashAction` consistent T4↔T5; `NotificationItem`/`unseenCount`/`recentNotifications` consistent T6↔T7; `Prefs` shared T7 (ProfileMenu ↔ TopBar); `createOtp`/`verifyOtp` consistent T2 (auth ↔ routes). `EventLog.detail` accessed as `{message?, outcome?}` — matches the seed shape in `prisma/seed-dev.ts`.
- **Risk note:** `EventLog.createdAt` is assumed to exist (Prisma default). Task 5/7 queries rely on it; if absent, add `createdAt DateTime @default(now())` to the model in Task 1 Step 1.
