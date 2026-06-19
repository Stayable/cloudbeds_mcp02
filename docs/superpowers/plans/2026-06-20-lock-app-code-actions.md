# Lock-App Code Actions Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated *write* surfaces of the lock-app — the Door/Room detail screen and the server actions behind it: reveal / revoke / manually-generate guest PINs, reveal / rotate the per-lock staff backup code, reconcile ("Sync from lock"), and edit the room→lock mapping — every action permission-gated and written to the audit log.

**Architecture:** All risky logic (PIN generation, validity windows, drift detection, audit-detail shaping, code-history view-model) lives in pure, unit-tested functions in `src/lib/`. The TTLock cloud calls are isolated in a ported `src/lib/ttlock.ts` (mirrors the middleware client — the two share *data* via Neon, not code). Server Actions (`"use server"`) are thin orchestrators: they check a permission, call TTLock + Prisma, write one `EventLog` row via a shared `writeAudit` helper, then `revalidatePath`. The Door detail page is a thin RSC that fetches with Prisma, calls the pure view-model, and renders permission-gated `<form>`s bound to those actions.

**Tech Stack:** Next.js 14 (App Router, RSC + Server Actions), React 18, Prisma 5, TypeScript, Tailwind, Vitest. No new dependencies.

**Builds on:**
- **Foundation (Plan 1):** `src/lib/db.ts` (prisma singleton), `src/lib/auth.ts` (`getSession`, `SessionUser`), `src/lib/rbac.ts` (`requirePermission`, `AuthError`), `src/lib/permissions.ts` (`PERMISSIONS`, `hasPermission`).
- **Read surfaces (Plan 2):** `src/lib/session-access.ts` (`requireUserOrRedirect`, `sessionCan`), `src/lib/rooms.ts` (`maskPin`), `src/lib/properties.ts` (`getProperty`), `src/components/Forbidden.tsx`, the Rooms grid page.
- **Middleware (sibling, copy-not-import):** `middleware/lib/ttlock.ts` (the client being ported), `middleware/lib/passcode-sync.ts` (the `generatePin` / `validityWindow` logic being mirrored).

## Global Constraints

- **Per-property scope on every action.** Every Server Action takes `propertyId` and calls `requirePermission(<perm>, propertyId)` FIRST. A user scoped to property A must never act on property B.
- **One TTLock account, no per-property routing.** Lock IDs are globally unique within the single "Stayable Access — main" account. `lockId` is a `BigInt` in Prisma and TTLock; convert to `String` at every boundary (forms, JSON, audit detail) — Next cannot serialize `BigInt`.
- **TTLock returns HTTP 200 on logical errors.** Non-zero `errcode` in the body must throw (the ported `assertOk` does this). A 200 does NOT prove the lock received the command — hence the reconcile step (spec §10).
- **Every state change writes exactly one `EventLog` row** with `actorUserId` / `actorEmail` / `actorRole` set, `source: "admin"`, and `detail.outcome` ∈ `success | warning | failed` (Plan 2's activity view reads `detail.outcome`). Code reveals are logged too (amber tint).
- **`Passcode.type` discipline (shared with middleware):** `guest` codes are owned by the middleware's reservation lifecycle; `manual` and `backup` codes are owned here. The middleware's revoke filters `type = guest`, so backup/manual codes are never auto-revoked on checkout. Never change a `guest` row's `type`.
- **Cannot validate live from the sandbox.** `euapi.ttlock.com` is unreachable here and no locks are registered yet. Pure functions are unit-tested; TTLock-touching code is verified by `npm run typecheck` + `npm run build` and validated live later on the user's machine. State this honestly in commits — do not claim live verification.
- **Verify every TTLock endpoint/param against TTLock docs** before trusting it (the design spec §11 already corrected `/keyboardPwd/create` → `/keyboardPwd/add`). New call in this plan: `listPasscodes` → flagged in Task 1 to verify.

---

## File Structure

```
lock-app/src/
  lib/
    ttlock.ts            # PORT of middleware client + listPasscodes + type-aware create (Task 1)
    passcodes.ts + .test # generatePin, guestValidityWindow, manualValidityWindow, pwd-type consts (Task 2)
    reconcile.ts + .test # detectDrift(dbCodes, lockCodes) (Task 3)
    audit.ts     + .test # buildDetail(...) pure detail shaper (Task 4)
    audit-write.ts       # writeAudit(actor, {...}) thin EventLog writer (Task 4)
    door-detail.ts + .test # classifyCode, splitCodes, toCodeRow view-model (Task 5)
  app/(app)/p/[propertyId]/rooms/[roomId]/
    actions.ts           # "use server" — all 8 actions (Tasks 6,7,8)
    page.tsx             # Door/Room detail RSC (Task 9)
  app/(app)/p/[propertyId]/rooms/
    page.tsx             # MODIFY: link each tile to /rooms/[roomId] (Task 9)
```

**Decisions locked here:**
- **In-process TTLock token for Plan 3.** Port the middleware's module-level token cache as-is. The durable `TtlockToken` DB store + refresh cron is **Plan 4** (background jobs) — its natural home. Re-auth on a cold start is cheap against a ~90-day token; YAGNI to build the durable store now.
- **Backup code = TTLock permanent passcode (`keyboardPwdType = 2`); guest/manual = period (`= 3`).** Spec §12 Q1 (offline `addType=1` vs gateway `addType=2`) stays as written today: `addType=2` (gateway push), same as the middleware. Provisioning resilience tuning is deferred — note it, don't fabricate a decision.
- **Manual codes** get a caller-chosen validity window (default 24h from now); they are `type: "manual"`, `reservationId: null`, and are revoked manually only.
- **Reveal is an action, not a render.** The masked code is what the page shows by default; revealing the raw PIN goes through a logged Server Action (amber audit row) and returns the value to a small client reveal component. Never ship the raw PIN in the initial server-rendered HTML.
- **Mapping CRUD lives on the Door detail** (the room's lock assignment) plus a create path for an unmapped room — gated by `mapping.edit`. No separate mapping page in this plan.
- **No new schema.** Every column used (`Passcode.type`, `EventLog.actor*`, `LockMap.*`) already exists from the Foundation. If a task seems to need a column that isn't there, STOP and raise it — do not add migrations in this plan.

---

## Task 1: Port the TTLock client into lock-app

**Files:**
- Create: `lock-app/src/lib/ttlock.ts`

**Interfaces:**
- Consumes: env vars `TTLOCK_CLIENT_ID/SECRET/USERNAME/PASSWORD`, optional `TTLOCK_BASE_URL`.
- Produces (used by Tasks 6–8):
  - `getTTLockToken(force?: boolean): Promise<{accessToken: string; refreshToken: string; uid: number; expiresAt: number}>`
  - `listLocks(pageNo?: number, pageSize?: number): Promise<{total: number; list: any[]}>`
  - `createPasscode(args: {lockId: number|bigint; passcode: string; keyboardPwdType: 2|3; startDate?: number; endDate?: number; name?: string}): Promise<{keyboardPwdId: number}>`
  - `deletePasscode(args: {lockId: number|bigint; keyboardPwdId: number|bigint}): Promise<void>`
  - `listPasscodes(lockId: number|bigint, pageNo?: number, pageSize?: number): Promise<{list: Array<{keyboardPwdId: number; keyboardPwd: string; keyboardPwdName: string; keyboardPwdType: number; startDate: number; endDate: number}>}>`

This is a **port of `middleware/lib/ttlock.ts`** (a network client — nothing pure to unit-test), extended with `listPasscodes` and a `keyboardPwdType` parameter on `createPasscode`. Verified by typecheck/build, not TDD.

- [ ] **Step 1: Copy the middleware client and apply the two extensions**

Create `lock-app/src/lib/ttlock.ts` with the full content below (it is the middleware client verbatim through `listLocks`, then the extended `createPasscode`, `deletePasscode`, and new `listPasscodes`):

```typescript
/**
 * TTLock Cloud API client — lock-app copy.
 *
 * This is a deliberate DUPLICATE of `middleware/lib/ttlock.ts`: Vercel can't
 * import across sibling project folders, so the apps share DATA (the Neon DB),
 * not code. Any change here that affects passcode behavior must be mirrored in
 * the middleware client and vice-versa.
 *
 * One TTLock account / one Application ("Stayable Access — main") owns every
 * lock across all 8 properties; lock IDs are globally unique, so there is no
 * per-property routing (unlike Cloudbeds' 8-account model).
 *
 * Auth: OAuth2 password grant with an MD5-hashed password. Token cached
 * in-process (~90-day life); a durable store + refresh cron is Plan 4.
 * API gateway: euapi.ttlock.com (euopen.ttlock.com is the docs portal, 404s here).
 */
import { createHash } from "node:crypto";

const TTLOCK_BASE = process.env.TTLOCK_BASE_URL ?? "https://euapi.ttlock.com";
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  uid: number;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function assertOk(body: any, context: string): void {
  if (body && typeof body.errcode === "number" && body.errcode !== 0) {
    throw new Error(`TTLock ${context} failed: errcode=${body.errcode} ${body.errmsg ?? ""}`.trim());
  }
}

async function postForm(path: string, params: Record<string, string | number>): Promise<any> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.set(k, String(v));
  const res = await fetch(`${TTLOCK_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`TTLock ${path} HTTP ${res.status}`);
  return res.json();
}

export async function getTTLockToken(force = false): Promise<CachedToken> {
  if (!force && cached && Date.now() < cached.expiresAt - EXPIRY_SKEW_MS) return cached;
  const body = await postForm("/oauth2/token", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    clientSecret: requiredEnv("TTLOCK_CLIENT_SECRET"),
    username: requiredEnv("TTLOCK_USERNAME"),
    password: md5(requiredEnv("TTLOCK_PASSWORD")),
    grant_type: "password",
  });
  if (!body.access_token) {
    throw new Error(`TTLock auth failed: ${body.errcode ?? "?"} ${body.errmsg ?? "no access_token"}`);
  }
  cached = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    uid: body.uid,
    expiresAt: Date.now() + Number(body.expires_in) * 1000,
  };
  return cached;
}

export async function listLocks(pageNo = 1, pageSize = 100): Promise<{ total: number; list: any[] }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/list", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    pageNo,
    pageSize,
    date: Date.now(),
  });
  assertOk(body, "lock/list");
  return { total: body.total ?? 0, list: body.list ?? [] };
}

export interface CreatePasscodeArgs {
  lockId: number | bigint;
  passcode: string;
  /** 3 = period (guest/manual, needs start/end); 2 = permanent (staff backup). */
  keyboardPwdType: 2 | 3;
  startDate?: number;
  endDate?: number;
  name?: string;
}

/**
 * Create a keyboard passcode. addType=2 pushes via the gateway/WiFi. Period codes
 * (type 3) require start/end (epoch-ms); permanent codes (type 2) omit them.
 * Returns the keyboardPwdId — MUST be stored to delete the PIN later.
 */
export async function createPasscode(args: CreatePasscodeArgs): Promise<{ keyboardPwdId: number }> {
  const { accessToken } = await getTTLockToken();
  const params: Record<string, string | number> = {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(args.lockId),
    keyboardPwd: args.passcode,
    keyboardPwdName: args.name ?? "",
    keyboardPwdType: args.keyboardPwdType,
    addType: 2,
    date: Date.now(),
  };
  if (args.keyboardPwdType === 3) {
    if (args.startDate == null || args.endDate == null) {
      throw new Error("period passcode (type 3) requires startDate and endDate");
    }
    params.startDate = args.startDate;
    params.endDate = args.endDate;
  }
  const body = await postForm("/v3/keyboardPwd/add", params);
  assertOk(body, "keyboardPwd/add");
  if (typeof body.keyboardPwdId !== "number") {
    throw new Error("TTLock keyboardPwd/add returned no keyboardPwdId");
  }
  return { keyboardPwdId: body.keyboardPwdId };
}

export interface DeletePasscodeArgs {
  lockId: number | bigint;
  keyboardPwdId: number | bigint;
}

export async function deletePasscode(args: DeletePasscodeArgs): Promise<void> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/keyboardPwd/delete", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(args.lockId),
    keyboardPwdId: String(args.keyboardPwdId),
    deleteType: 2,
    date: Date.now(),
  });
  assertOk(body, "keyboardPwd/delete");
}

export interface LockPasscode {
  keyboardPwdId: number;
  keyboardPwd: string;
  keyboardPwdName: string;
  keyboardPwdType: number;
  startDate: number;
  endDate: number;
}

/**
 * List the passcodes currently registered on a lock — the source of truth for
 * reconciliation (spec §10). ⚠️ VERIFY THE PATH against TTLock docs before
 * trusting live: this uses /v3/lock/listKeyboardPwd (lockId, pageNo, pageSize,
 * date). If the live response shape differs, adjust the mapping here only.
 */
export async function listPasscodes(
  lockId: number | bigint,
  pageNo = 1,
  pageSize = 100,
): Promise<{ list: LockPasscode[] }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/listKeyboardPwd", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    pageNo,
    pageSize,
    date: Date.now(),
  });
  assertOk(body, "lock/listKeyboardPwd");
  return { list: (body.list ?? []) as LockPasscode[] };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd lock-app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lock-app/src/lib/ttlock.ts
git commit -m "lock-app: port TTLock client (type-aware create + listPasscodes)"
```

---

## Task 2: Passcode logic (PIN generation + validity windows)

**Files:**
- Create: `lock-app/src/lib/passcodes.ts`
- Test: `lock-app/src/lib/passcodes.test.ts`

**Interfaces:**
- Produces (used by Tasks 6,8):
  - `PIN_LENGTH: number` (= 6), `PERIOD_PWD_TYPE = 3`, `BACKUP_PWD_TYPE = 2`
  - `generatePin(length?: number): string`
  - `guestValidityWindow(startDate?: string, endDate?: string): {startTs: number; endTs: number}`
  - `manualValidityWindow(nowMs: number, hours: number): {startTs: number; endTs: number}`

- [ ] **Step 1: Write the failing test**

```typescript
// lock-app/src/lib/passcodes.test.ts
import { describe, it, expect } from "vitest";
import {
  generatePin, guestValidityWindow, manualValidityWindow, PIN_LENGTH,
} from "./passcodes";

describe("generatePin", () => {
  it("returns a PIN_LENGTH string of digits by default", () => {
    const pin = generatePin();
    expect(pin).toHaveLength(PIN_LENGTH);
    expect(pin).toMatch(/^\d+$/);
  });
  it("honors a custom length and never starts with 0 (full-width)", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin(4);
      expect(pin).toHaveLength(4);
      expect(pin[0]).not.toBe("0");
    }
  });
});

describe("guestValidityWindow", () => {
  it("opens at UTC start-of-arrival and closes at UTC end-of-departure", () => {
    const { startTs, endTs } = guestValidityWindow("2026-06-20", "2026-06-22");
    expect(startTs).toBe(Date.parse("2026-06-20T00:00:00Z"));
    expect(endTs).toBe(Date.parse("2026-06-22T23:59:59Z"));
  });
  it("throws on an invalid range", () => {
    expect(() => guestValidityWindow(undefined, "2026-06-22")).toThrow();
  });
});

describe("manualValidityWindow", () => {
  it("spans now to now + hours", () => {
    const now = Date.parse("2026-06-20T12:00:00Z");
    const { startTs, endTs } = manualValidityWindow(now, 24);
    expect(startTs).toBe(now);
    expect(endTs).toBe(now + 24 * 3600 * 1000);
  });
  it("throws on a non-positive duration", () => {
    expect(() => manualValidityWindow(Date.now(), 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd lock-app && npx vitest run src/lib/passcodes.test.ts`
Expected: FAIL — `Cannot find module './passcodes'`.

- [ ] **Step 3: Implement**

```typescript
// lock-app/src/lib/passcodes.ts
/**
 * Pure passcode helpers. PIN generation + validity-window math, shared by the
 * guest/manual/backup Server Actions. Mirrors the middleware's generatePin /
 * validityWindow so codes minted here behave identically to webhook-minted ones.
 */
import { randomInt } from "node:crypto";

export const PIN_LENGTH = 6;
/** TTLock keyboardPwdType: 3 = period (guest/manual), 2 = permanent (staff backup). */
export const PERIOD_PWD_TYPE = 3 as const;
export const BACKUP_PWD_TYPE = 2 as const;

/** Cryptographically-uniform N-digit PIN with no leading zero (full width). */
export function generatePin(length: number = PIN_LENGTH): string {
  if (length < 4 || length > 9) throw new Error("PIN length must be 4–9 (TTLock limit)");
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max));
}

/** Guest window: UTC start-of-arrival → end-of-departure (mirrors middleware). */
export function guestValidityWindow(startDate?: string, endDate?: string): { startTs: number; endTs: number } {
  const startTs = startDate ? Date.parse(`${startDate}T00:00:00Z`) : NaN;
  const endTs = endDate ? Date.parse(`${endDate}T23:59:59Z`) : NaN;
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
    throw new Error(`Invalid reservation date range: start=${startDate} end=${endDate}`);
  }
  return { startTs, endTs };
}

/** Manual window: now → now + hours. */
export function manualValidityWindow(nowMs: number, hours: number): { startTs: number; endTs: number } {
  if (!(hours > 0)) throw new Error("manual code duration must be positive");
  return { startTs: nowMs, endTs: nowMs + Math.round(hours * 3600 * 1000) };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd lock-app && npx vitest run src/lib/passcodes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/passcodes.ts lock-app/src/lib/passcodes.test.ts
git commit -m "lock-app: pure passcode helpers (PIN gen + validity windows)"
```

---

## Task 3: Reconciliation drift detection

**Files:**
- Create: `lock-app/src/lib/reconcile.ts`
- Test: `lock-app/src/lib/reconcile.test.ts`

**Interfaces:**
- Produces (used by Task 8 `syncFromLock`):
  - `type DriftResult = {missingOnLock: string[]; orphanOnLock: string[]; inSync: boolean}`
  - `detectDrift(dbActiveIds: string[], lockPwdIds: string[]): DriftResult`
  - keyboardPwdIds are compared as **strings** (they are BigInt in the DB).

`missingOnLock` = codes the DB believes are active but the lock does not have (guest-lockout risk). `orphanOnLock` = codes on the lock we don't track (stale or foreign). `inSync` = both empty.

- [ ] **Step 1: Write the failing test**

```typescript
// lock-app/src/lib/reconcile.test.ts
import { describe, it, expect } from "vitest";
import { detectDrift } from "./reconcile";

describe("detectDrift", () => {
  it("reports in-sync when the sets match (order-independent)", () => {
    expect(detectDrift(["1", "2"], ["2", "1"])).toEqual({
      missingOnLock: [], orphanOnLock: [], inSync: true,
    });
  });
  it("flags a DB code absent from the lock as missingOnLock (lockout risk)", () => {
    const r = detectDrift(["1", "2"], ["1"]);
    expect(r.missingOnLock).toEqual(["2"]);
    expect(r.orphanOnLock).toEqual([]);
    expect(r.inSync).toBe(false);
  });
  it("flags a lock code we don't track as orphanOnLock", () => {
    const r = detectDrift(["1"], ["1", "9"]);
    expect(r.orphanOnLock).toEqual(["9"]);
    expect(r.missingOnLock).toEqual([]);
    expect(r.inSync).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd lock-app && npx vitest run src/lib/reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lock-app/src/lib/reconcile.ts
/**
 * Pure drift detection for "Sync from lock" (spec §10). TTLock returns 200 even
 * when a command never reached a lock, so we list the lock's real passcodes and
 * diff them against what our DB believes is active. The Server Action does the
 * I/O; this does the comparison.
 */
export interface DriftResult {
  /** Active in our DB but NOT on the lock — potential guest lockout. */
  missingOnLock: string[];
  /** On the lock but not tracked by us — stale/foreign code. */
  orphanOnLock: string[];
  inSync: boolean;
}

export function detectDrift(dbActiveIds: string[], lockPwdIds: string[]): DriftResult {
  const onLock = new Set(lockPwdIds);
  const inDb = new Set(dbActiveIds);
  const missingOnLock = dbActiveIds.filter((id) => !onLock.has(id));
  const orphanOnLock = lockPwdIds.filter((id) => !inDb.has(id));
  return { missingOnLock, orphanOnLock, inSync: missingOnLock.length === 0 && orphanOnLock.length === 0 };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd lock-app && npx vitest run src/lib/reconcile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/reconcile.ts lock-app/src/lib/reconcile.test.ts
git commit -m "lock-app: pure drift detection for sync-from-lock"
```

---

## Task 4: Audit detail shaper + writer

**Files:**
- Create: `lock-app/src/lib/audit.ts`
- Test: `lock-app/src/lib/audit.test.ts`
- Create: `lock-app/src/lib/audit-write.ts`

**Interfaces:**
- Produces:
  - `type Outcome = "success" | "warning" | "failed"`
  - `buildDetail(input: {outcome?: Outcome; reservationId?: string; beforePin?: string; afterPin?: string; message?: string; extra?: Record<string, unknown>}): Record<string, unknown>` — pure; always sets `outcome` (default `"success"`), and when both pins are given adds a masked `change` string (`"••••11 → ••••90"`).
  - `writeAudit(actor: {id: string; email: string; roleName: string}, entry: {action: string; propertyId: string; roomId?: string; lockId?: bigint | null; event?: string; detail: Record<string, unknown>}): Promise<void>` — thin `prisma.eventLog.create` with `source: "admin"`.

- [ ] **Step 1: Write the failing test (pure shaper only)**

```typescript
// lock-app/src/lib/audit.test.ts
import { describe, it, expect } from "vitest";
import { buildDetail } from "./audit";

describe("buildDetail", () => {
  it("defaults outcome to success", () => {
    expect(buildDetail({})).toEqual({ outcome: "success" });
  });
  it("passes through outcome, message, reservationId and extra", () => {
    const d = buildDetail({ outcome: "warning", message: "drift", reservationId: "R1", extra: { missingOnLock: ["2"] } });
    expect(d).toMatchObject({ outcome: "warning", message: "drift", reservationId: "R1", missingOnLock: ["2"] });
  });
  it("renders a masked before→after change when both pins are given", () => {
    const d = buildDetail({ beforePin: "111111", afterPin: "909090" });
    expect(d.change).toBe("••••11 → ••••90");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd lock-app && npx vitest run src/lib/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure shaper**

```typescript
// lock-app/src/lib/audit.ts
/**
 * Pure shaper for EventLog.detail (Json). Plan 2's activity view reads
 * detail.outcome to tint rows (amber = sensitive, red = failed), so every action
 * routes its detail through here to guarantee outcome is present and changes are
 * masked. The DB write itself lives in audit-write.ts.
 */
import { maskPin } from "./rooms";

export type Outcome = "success" | "warning" | "failed";

export interface BuildDetailInput {
  outcome?: Outcome;
  reservationId?: string;
  beforePin?: string;
  afterPin?: string;
  message?: string;
  extra?: Record<string, unknown>;
}

export function buildDetail(input: BuildDetailInput): Record<string, unknown> {
  const detail: Record<string, unknown> = { outcome: input.outcome ?? "success", ...input.extra };
  if (input.reservationId) detail.reservationId = input.reservationId;
  if (input.message) detail.message = input.message;
  if (input.beforePin && input.afterPin) {
    detail.change = `${maskPin(input.beforePin)} → ${maskPin(input.afterPin)}`;
  }
  return detail;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd lock-app && npx vitest run src/lib/audit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the thin writer (no unit test — pure I/O)**

```typescript
// lock-app/src/lib/audit-write.ts
import { prisma } from "./db";

/** Write one audit row attributing a UI action to the acting user. */
export async function writeAudit(
  actor: { id: string; email: string; roleName: string },
  entry: {
    action: string;
    propertyId: string;
    roomId?: string;
    lockId?: bigint | null;
    event?: string;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.eventLog.create({
    data: {
      source: "admin",
      event: entry.event ?? entry.action,
      propertyId: entry.propertyId,
      roomId: entry.roomId ?? null,
      lockId: entry.lockId ?? null,
      action: entry.action,
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.roleName,
      detail: entry.detail as object,
    },
  });
}
```

- [ ] **Step 6: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lock-app/src/lib/audit.ts lock-app/src/lib/audit.test.ts lock-app/src/lib/audit-write.ts
git commit -m "lock-app: audit detail shaper + EventLog writer"
```

---

## Task 5: Door-detail view-model

**Files:**
- Create: `lock-app/src/lib/door-detail.ts`
- Test: `lock-app/src/lib/door-detail.test.ts`

**Interfaces:**
- Consumes: `maskPin` from `./rooms`.
- Produces (used by Task 9 page):
  - `type CodeStatus = "active" | "expired" | "revoked"`
  - `interface PasscodeInput {keyboardPwdId: string; pin: string; type: string; status: string; startTs: number; endTs: number; reservationId: string | null; createdAt: number}`
  - `interface CodeRow {keyboardPwdId: string; maskedPin: string; type: string; status: CodeStatus; window: string; reservationId: string | null}`
  - `classifyCode(p: PasscodeInput, nowMs: number): CodeStatus`
  - `toCodeRow(p: PasscodeInput, nowMs: number): CodeRow`
  - `splitCodes(rows: PasscodeInput[], nowMs: number): {guest: CodeRow | null; backup: CodeRow | null; manual: CodeRow[]; history: CodeRow[]}`

`guest`/`backup` are the single active code of that type; `manual` is all active manual codes; `history` is every non-active code (expired or revoked), newest first.

- [ ] **Step 1: Write the failing test**

```typescript
// lock-app/src/lib/door-detail.test.ts
import { describe, it, expect } from "vitest";
import { classifyCode, splitCodes, type PasscodeInput } from "./door-detail";

const NOW = Date.parse("2026-06-20T12:00:00Z");
const base: PasscodeInput = {
  keyboardPwdId: "1", pin: "123472", type: "guest", status: "active",
  startTs: NOW - 3600_000, endTs: NOW + 3600_000, reservationId: "R1", createdAt: NOW - 7200_000,
};

describe("classifyCode", () => {
  it("is revoked when status is revoked, regardless of window", () => {
    expect(classifyCode({ ...base, status: "revoked" }, NOW)).toBe("revoked");
  });
  it("is expired when a period code's endTs has passed", () => {
    expect(classifyCode({ ...base, endTs: NOW - 1 }, NOW)).toBe("expired");
  });
  it("is active within the window", () => {
    expect(classifyCode(base, NOW)).toBe("active");
  });
  it("treats a permanent backup code (endTs 0) as active", () => {
    expect(classifyCode({ ...base, type: "backup", endTs: 0 }, NOW)).toBe("active");
  });
});

describe("splitCodes", () => {
  it("buckets active guest/backup/manual and pushes the rest to history newest-first", () => {
    const rows: PasscodeInput[] = [
      base,
      { ...base, keyboardPwdId: "2", type: "backup", endTs: 0, reservationId: null },
      { ...base, keyboardPwdId: "3", type: "manual", reservationId: null },
      { ...base, keyboardPwdId: "4", status: "revoked", createdAt: NOW - 1000 },
      { ...base, keyboardPwdId: "5", endTs: NOW - 1, createdAt: NOW - 500 },
    ];
    const out = splitCodes(rows, NOW);
    expect(out.guest?.keyboardPwdId).toBe("1");
    expect(out.backup?.keyboardPwdId).toBe("2");
    expect(out.manual.map((m) => m.keyboardPwdId)).toEqual(["3"]);
    expect(out.history.map((h) => h.keyboardPwdId)).toEqual(["5", "4"]);
    expect(out.guest?.maskedPin).toBe("••••72");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd lock-app && npx vitest run src/lib/door-detail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lock-app/src/lib/door-detail.ts
/**
 * Pure view-model for the Door/Room detail screen. Turns raw Passcode rows into
 * displayable code rows and buckets them into the panels the page renders
 * (active guest code, staff backup code, active manual codes, and history).
 */
import { maskPin } from "./rooms";

export type CodeStatus = "active" | "expired" | "revoked";

export interface PasscodeInput {
  keyboardPwdId: string;
  pin: string;
  type: string;
  status: string;
  startTs: number;
  endTs: number;
  reservationId: string | null;
  createdAt: number;
}

export interface CodeRow {
  keyboardPwdId: string;
  maskedPin: string;
  type: string;
  status: CodeStatus;
  window: string;
  reservationId: string | null;
}

export function classifyCode(p: PasscodeInput, nowMs: number): CodeStatus {
  if (p.status === "revoked") return "revoked";
  if (p.status === "failed") return "revoked";
  // endTs 0 marks a permanent (backup) code — never expires by time.
  if (p.endTs > 0 && p.endTs < nowMs) return "expired";
  return "active";
}

function windowLabel(p: PasscodeInput): string {
  if (p.endTs === 0) return "permanent";
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  return `${fmt(p.startTs)} → ${fmt(p.endTs)} UTC`;
}

export function toCodeRow(p: PasscodeInput, nowMs: number): CodeRow {
  return {
    keyboardPwdId: p.keyboardPwdId,
    maskedPin: maskPin(p.pin),
    type: p.type,
    status: classifyCode(p, nowMs),
    window: windowLabel(p),
    reservationId: p.reservationId,
  };
}

export function splitCodes(rows: PasscodeInput[], nowMs: number) {
  let guest: CodeRow | null = null;
  let backup: CodeRow | null = null;
  const manual: CodeRow[] = [];
  const history: CodeRow[] = [];
  // History newest-first; deterministic ordering independent of input order.
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  for (const p of sorted) {
    const row = toCodeRow(p, nowMs);
    if (row.status !== "active") {
      history.push(row);
      continue;
    }
    if (p.type === "guest" && !guest) guest = row;
    else if (p.type === "backup" && !backup) backup = row;
    else if (p.type === "manual") manual.push(row);
    else history.push(row); // a second active code of a singleton type — surface it
  }
  return { guest, backup, manual, history };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd lock-app && npx vitest run src/lib/door-detail.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lock-app/src/lib/door-detail.ts lock-app/src/lib/door-detail.test.ts
git commit -m "lock-app: door-detail view-model (classify + split codes)"
```

---

## Task 6: Guest-code Server Actions (reveal / revoke / manual)

**Files:**
- Create: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts`

**Interfaces:**
- Consumes: `requirePermission` (rbac), `prisma` (db), `getTTLockToken`-backed `createPasscode`/`deletePasscode` (ttlock), `generatePin`/`manualValidityWindow`/`PERIOD_PWD_TYPE` (passcodes), `buildDetail`/`writeAudit`.
- Produces (used by Task 9 page):
  - `revealGuestCode(propertyId: string, roomId: string): Promise<{ pin: string }>`
  - `revokeGuestCode(propertyId: string, roomId: string): Promise<void>`
  - `generateManualCode(formData: FormData): Promise<void>` (reads `propertyId`, `roomId`, `hours`)

No pure logic is added here (it was all extracted in Tasks 2–5); these are thin orchestrators verified by typecheck/build and validated live later.

- [ ] **Step 1: Create the actions file with the three guest actions**

```typescript
// lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createPasscode, deletePasscode } from "@/lib/ttlock";
import { generatePin, manualValidityWindow, PERIOD_PWD_TYPE } from "@/lib/passcodes";
import { buildDetail } from "@/lib/audit";
import { writeAudit } from "@/lib/audit-write";

function detailPath(propertyId: string, roomId: string): string {
  return `/p/${propertyId}/rooms/${roomId}`;
}

/** Reveal the active guest PIN (logged, amber). Returns the raw value to the caller. */
export async function revealGuestCode(propertyId: string, roomId: string): Promise<{ pin: string }> {
  const user = await requirePermission("guest_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error("No active guest code for this room");
  await writeAudit(user, {
    action: "code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning", reservationId: code.reservationId ?? undefined }),
  });
  return { pin: code.pin };
}

/** Revoke the active guest PIN: delete on the lock, mark revoked, log. */
export async function revokeGuestCode(propertyId: string, roomId: string): Promise<void> {
  const user = await requirePermission("guest_code.revoke", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "guest", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error("No active guest code to revoke");
  await deletePasscode({ lockId: code.lockId, keyboardPwdId: code.keyboardPwdId });
  await prisma.passcode.update({ where: { id: code.id }, data: { status: "revoked" } });
  await writeAudit(user, {
    action: "guest_code_revoked", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ reservationId: code.reservationId ?? undefined }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

/** Generate a manual (no-reservation) period code valid for `hours` from now. */
export async function generateManualCode(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId"));
  const roomId = String(formData.get("roomId"));
  const hours = Number(formData.get("hours") ?? 24);
  const user = await requirePermission("guest_code.generate_manual", propertyId);

  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const pin = generatePin();
  const { startTs, endTs } = manualValidityWindow(Date.now(), hours);
  const { keyboardPwdId } = await createPasscode({
    lockId: map.lockId, passcode: pin, keyboardPwdType: PERIOD_PWD_TYPE,
    startDate: startTs, endDate: endTs, name: "Manual",
  });
  await prisma.passcode.create({
    data: {
      reservationId: null, propertyId, roomId, lockId: map.lockId,
      keyboardPwdId: BigInt(keyboardPwdId), pin,
      startTs: BigInt(startTs), endTs: BigInt(endTs), status: "active", type: "manual",
    },
  });
  await writeAudit(user, {
    action: "manual_code_created", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ extra: { hours, keyboardPwdId: String(keyboardPwdId) } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts"
git commit -m "lock-app: guest-code actions (reveal/revoke/manual)"
```

---

## Task 7: Backup-code + Sync Server Actions

**Files:**
- Modify: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts`

**Interfaces:**
- Consumes (additionally): `listPasscodes`, `BACKUP_PWD_TYPE`, `detectDrift`.
- Produces (used by Task 9 page):
  - `revealBackupCode(propertyId: string, roomId: string): Promise<{ pin: string }>`
  - `rotateBackupCode(propertyId: string, roomId: string): Promise<void>`
  - `syncFromLock(propertyId: string, roomId: string): Promise<{ inSync: boolean; missingOnLock: string[]; orphanOnLock: string[] }>`

- [ ] **Step 1: Extend the imports at the top of `actions.ts`**

Replace the ttlock + passcodes + new-lib imports so the file imports the additional symbols:

```typescript
import { createPasscode, deletePasscode, listPasscodes } from "@/lib/ttlock";
import { generatePin, manualValidityWindow, PERIOD_PWD_TYPE, BACKUP_PWD_TYPE } from "@/lib/passcodes";
import { detectDrift } from "@/lib/reconcile";
```

(The `buildDetail`, `writeAudit`, `prisma`, `requirePermission`, `revalidatePath`, and `detailPath` already imported in Task 6 stay.)

- [ ] **Step 2: Append the three actions to `actions.ts`**

```typescript
/** Reveal the per-lock staff backup code (logged, amber). */
export async function revealBackupCode(propertyId: string, roomId: string): Promise<{ pin: string }> {
  const user = await requirePermission("backup_code.reveal", propertyId);
  const code = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!code) throw new Error("No backup code set for this room — rotate to create one");
  await writeAudit(user, {
    action: "backup_code_revealed", propertyId, roomId, lockId: code.lockId,
    detail: buildDetail({ outcome: "warning" }),
  });
  return { pin: code.pin };
}

/**
 * Rotate the staff backup code: provision a NEW permanent code, then delete the
 * old one (new-first so a failure never leaves the room with no backup), and log
 * the masked before→after.
 */
export async function rotateBackupCode(propertyId: string, roomId: string): Promise<void> {
  const user = await requirePermission("backup_code.rotate", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const old = await prisma.passcode.findFirst({
    where: { propertyId, roomId, type: "backup", status: "active" },
    orderBy: { createdAt: "desc" },
  });

  const pin = generatePin();
  const { keyboardPwdId } = await createPasscode({
    lockId: map.lockId, passcode: pin, keyboardPwdType: BACKUP_PWD_TYPE, name: "Staff backup",
  });
  await prisma.passcode.create({
    data: {
      reservationId: null, propertyId, roomId, lockId: map.lockId,
      keyboardPwdId: BigInt(keyboardPwdId), pin,
      startTs: BigInt(0), endTs: BigInt(0), status: "active", type: "backup",
    },
  });
  if (old) {
    await deletePasscode({ lockId: old.lockId, keyboardPwdId: old.keyboardPwdId });
    await prisma.passcode.update({ where: { id: old.id }, data: { status: "revoked" } });
  }
  await writeAudit(user, {
    action: "backup_code_rotated", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({ beforePin: old?.pin, afterPin: pin }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

/**
 * Reconcile our DB against the lock (spec §10). Lists the lock's real passcodes,
 * diffs against our active rows, logs a warning on drift (potential lockout).
 */
export async function syncFromLock(
  propertyId: string, roomId: string,
): Promise<{ inSync: boolean; missingOnLock: string[]; orphanOnLock: string[] }> {
  const user = await requirePermission("lock.sync", propertyId);
  const map = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!map) throw new Error("Room is not mapped to a lock");

  const [{ list }, active] = await Promise.all([
    listPasscodes(map.lockId),
    prisma.passcode.findMany({ where: { propertyId, roomId, status: "active" } }),
  ]);
  const drift = detectDrift(
    active.map((p) => String(p.keyboardPwdId)),
    list.map((p) => String(p.keyboardPwdId)),
  );
  await writeAudit(user, {
    action: "sync_from_lock", propertyId, roomId, lockId: map.lockId,
    detail: buildDetail({
      outcome: drift.inSync ? "success" : "warning",
      message: drift.inSync ? "in sync" : "drift detected",
      extra: { missingOnLock: drift.missingOnLock, orphanOnLock: drift.orphanOnLock },
    }),
  });
  revalidatePath(detailPath(propertyId, roomId));
  return drift;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts"
git commit -m "lock-app: backup-code rotate/reveal + sync-from-lock actions"
```

---

## Task 8: Mapping CRUD Server Actions

**Files:**
- Modify: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts`

**Interfaces:**
- Produces (used by Task 9 page):
  - `upsertMapping(formData: FormData): Promise<void>` (reads `propertyId`, `roomId`, `lockId`, `alias`)
  - `deleteMapping(propertyId: string, roomId: string): Promise<void>`

- [ ] **Step 1: Append the mapping actions to `actions.ts`**

```typescript
/** Create or update the room→lock mapping. lockId arrives as a decimal string. */
export async function upsertMapping(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId"));
  const roomId = String(formData.get("roomId"));
  const lockIdRaw = String(formData.get("lockId") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim() || null;
  const user = await requirePermission("mapping.edit", propertyId);
  if (!/^\d+$/.test(lockIdRaw)) throw new Error("Lock ID must be a positive integer");
  const lockId = BigInt(lockIdRaw);

  const existing = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  await prisma.lockMap.upsert({
    where: { propertyId_roomId: { propertyId, roomId } },
    create: { propertyId, roomId, lockId, alias },
    update: { lockId, alias },
  });
  await writeAudit(user, {
    action: "mapping_changed", propertyId, roomId, lockId,
    detail: buildDetail({
      message: existing ? "remapped" : "created",
      extra: { from: existing ? String(existing.lockId) : null, to: String(lockId), alias },
    }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}

/** Remove a room→lock mapping (does not touch codes already on the lock). */
export async function deleteMapping(propertyId: string, roomId: string): Promise<void> {
  const user = await requirePermission("mapping.edit", propertyId);
  const existing = await prisma.lockMap.findUnique({
    where: { propertyId_roomId: { propertyId, roomId } },
  });
  if (!existing) return;
  await prisma.lockMap.delete({ where: { propertyId_roomId: { propertyId, roomId } } });
  await writeAudit(user, {
    action: "mapping_changed", propertyId, roomId, lockId: existing.lockId,
    detail: buildDetail({ message: "deleted", extra: { from: String(existing.lockId) } }),
  });
  revalidatePath(detailPath(propertyId, roomId));
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd lock-app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/actions.ts"
git commit -m "lock-app: room->lock mapping CRUD actions"
```

---

## Task 9: Door/Room detail page + link from Rooms grid

**Files:**
- Create: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx`
- Create: `lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/RevealButton.tsx`
- Modify: `lock-app/src/app/(app)/p/[propertyId]/rooms/page.tsx` (link each tile)

**Interfaces:**
- Consumes: all Task 6–8 actions, `splitCodes` (door-detail), `requireUserOrRedirect`/`sessionCan` (session-access), `getProperty` (properties), `Forbidden`.

- [ ] **Step 1: Create the client reveal component**

```tsx
// lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/RevealButton.tsx
"use client";
import { useState, useTransition } from "react";

/** Calls a logged reveal Server Action and shows the returned PIN inline. */
export default function RevealButton({
  label, action,
}: {
  label: string;
  action: () => Promise<{ pin: string }>;
}) {
  const [pin, setPin] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (pin) return <code style={{ fontSize: 18, letterSpacing: 2 }}>{pin}</code>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setPin((await action()).pin))}
      style={{ padding: "6px 12px", background: "#041E42", color: "#fff", border: "none", borderRadius: 6 }}
    >
      {pending ? "…" : label}
    </button>
  );
}
```

- [ ] **Step 2: Create the detail page**

```tsx
// lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx
import { prisma } from "@/lib/db";
import { requireUserOrRedirect, sessionCan } from "@/lib/session-access";
import { getProperty } from "@/lib/properties";
import { splitCodes, type PasscodeInput } from "@/lib/door-detail";
import Forbidden from "@/components/Forbidden";
import RevealButton from "./RevealButton";
import {
  revealGuestCode, revokeGuestCode, generateManualCode,
  revealBackupCode, rotateBackupCode, syncFromLock,
  upsertMapping, deleteMapping,
} from "./actions";

export const dynamic = "force-dynamic";

const NAVY = "#041E42";
const btn = { padding: "8px 16px", color: "#fff", background: NAVY, border: "none", borderRadius: 6 } as const;

export default async function DoorDetailPage({ params }: { params: { propertyId: string; roomId: string } }) {
  const { propertyId, roomId } = params;
  const user = await requireUserOrRedirect();
  if (!sessionCan(user, "rooms.view", propertyId)) return <Forbidden what="this room" />;
  const property = getProperty(propertyId);
  if (!property) return <Forbidden what="this property" />;

  const [map, codes] = await Promise.all([
    prisma.lockMap.findUnique({ where: { propertyId_roomId: { propertyId, roomId } } }),
    prisma.passcode.findMany({ where: { propertyId, roomId } }),
  ]);
  const rows: PasscodeInput[] = codes.map((c) => ({
    keyboardPwdId: String(c.keyboardPwdId), pin: c.pin, type: c.type, status: c.status,
    startTs: Number(c.startTs), endTs: Number(c.endTs),
    reservationId: c.reservationId, createdAt: c.createdAt.getTime(),
  }));
  const { guest, backup, manual, history } = splitCodes(rows, Date.now());

  const can = (p: Parameters<typeof sessionCan>[1]) => sessionCan(user, p, propertyId);

  return (
    <div style={{ color: NAVY, maxWidth: 760 }}>
      <a href={`/p/${propertyId}/rooms`} style={{ color: NAVY }}>← {property.name} Rooms</a>
      <h1>Room {map?.alias?.trim() || roomId}</h1>

      {!map && (
        <p style={{ color: "#b9770e" }}>This room is not mapped to a lock. Map it below to manage codes.</p>
      )}

      {/* Guest code panel (navy) */}
      <section style={{ background: NAVY, color: "#fff", borderRadius: 10, padding: 16, marginTop: 12 }}>
        <h2 style={{ color: "#FDDA24", marginTop: 0 }}>Guest code</h2>
        {guest ? (
          <>
            <div>Code: {can("guest_code.reveal")
              ? <RevealButton label={`Reveal ${guest.maskedPin}`} action={async () => { "use server"; return revealGuestCode(propertyId, roomId); }} />
              : <code>{guest.maskedPin}</code>}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{guest.window}{guest.reservationId ? ` · res ${guest.reservationId}` : ""}</div>
            {can("guest_code.revoke") && (
              <form action={async () => { "use server"; await revokeGuestCode(propertyId, roomId); }} style={{ marginTop: 10 }}>
                <button style={{ ...btn, background: "#c0392b" }}>Revoke</button>
              </form>
            )}
          </>
        ) : <p>No active guest code.</p>}

        {can("guest_code.generate_manual") && map && (
          <form action={generateManualCode} style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="roomId" value={roomId} />
            <label style={{ fontSize: 13 }}>Manual code for
              <input name="hours" type="number" min={1} defaultValue={24} style={{ width: 64, margin: "0 6px", padding: 4 }} />h</label>
            <button style={btn}>Generate</button>
          </form>
        )}

        {can("lock.sync") && map && (
          <form action={async () => { "use server"; await syncFromLock(propertyId, roomId); }} style={{ marginTop: 10 }}>
            <button style={{ ...btn, background: "#456" }}>Sync from lock</button>
          </form>
        )}
      </section>

      {/* Staff backup code panel (gold dashed) */}
      <section style={{ border: "2px dashed #FDDA24", borderRadius: 10, padding: 16, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Staff backup code <span style={{ fontSize: 12, color: "#456" }}>(works offline)</span></h2>
        {backup ? (
          <div>{can("backup_code.reveal")
            ? <RevealButton label={`Reveal ${backup.maskedPin}`} action={async () => { "use server"; return revealBackupCode(propertyId, roomId); }} />
            : <code>{backup.maskedPin}</code>}</div>
        ) : <p>No backup code set.</p>}
        {can("backup_code.rotate") && map && (
          <form action={async () => { "use server"; await rotateBackupCode(propertyId, roomId); }} style={{ marginTop: 10 }}>
            <button style={btn}>{backup ? "Rotate" : "Create backup code"}</button>
          </form>
        )}
      </section>

      {/* Manual codes */}
      {manual.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3>Manual codes</h3>
          <ul>{manual.map((m) => <li key={m.keyboardPwdId}>{m.maskedPin} · {m.window}</li>)}</ul>
        </section>
      )}

      {/* Code history */}
      <section style={{ marginTop: 16 }}>
        <h3>Code history</h3>
        {history.length === 0 ? <p>None.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: `1px solid ${NAVY}` }}>
              <th>Code</th><th>Type</th><th>Status</th><th>Window</th><th>Reservation</th>
            </tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.keyboardPwdId} style={{ borderBottom: "1px solid #e3e8ef" }}>
                <td>{h.maskedPin}</td><td>{h.type}</td><td>{h.status}</td><td>{h.window}</td><td>{h.reservationId ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* Mapping CRUD */}
      {can("mapping.edit") && (
        <section style={{ marginTop: 16, borderTop: `1px solid ${NAVY}`, paddingTop: 12 }}>
          <h3>Lock mapping</h3>
          <form action={upsertMapping} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="roomId" value={roomId} />
            <input name="lockId" placeholder="TTLock Lock ID" defaultValue={map ? String(map.lockId) : ""} style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }} />
            <input name="alias" placeholder="Alias (optional)" defaultValue={map?.alias ?? ""} style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }} />
            <button style={btn}>{map ? "Update mapping" : "Create mapping"}</button>
          </form>
          {map && (
            <form action={async () => { "use server"; await deleteMapping(propertyId, roomId); }} style={{ marginTop: 8 }}>
              <button style={{ ...btn, background: "#c0392b" }}>Remove mapping</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2b: Make Rooms-grid tiles link to the detail page**

In `lock-app/src/app/(app)/p/[propertyId]/rooms/page.tsx`, wrap each tile in a link. Change the tile's opening element from:

```tsx
          <div key={t.roomId} style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden" }}>
```

to an anchor (and close with `</a>` instead of `</div>`):

```tsx
          <a key={t.roomId} href={`/p/${propertyId}/rooms/${t.roomId}`} style={{ border: "1px solid #d7dde6", borderRadius: 10, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
```

Find the matching closing `</div>` for that tile (the one immediately before `))}`) and change it to `</a>`.

- [ ] **Step 3: Verify typecheck + build**

Run: `cd lock-app && npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds (the route `/(app)/p/[propertyId]/rooms/[roomId]` compiles).

- [ ] **Step 4: Run the full test suite (no regressions)**

Run: `cd lock-app && npm test`
Expected: all Plan 2 tests + the new `passcodes`/`reconcile`/`audit`/`door-detail` suites PASS.

- [ ] **Step 5: Commit**

```bash
git add "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/page.tsx" \
        "lock-app/src/app/(app)/p/[propertyId]/rooms/[roomId]/RevealButton.tsx" \
        "lock-app/src/app/(app)/p/[propertyId]/rooms/page.tsx"
git commit -m "lock-app: Door/Room detail page + link from Rooms grid"
```

---

## Task 10: Seed sample codes for local demo + update todo

**Files:**
- Modify: `lock-app/prisma/seed-dev.ts`
- Modify: `todo.md`

**Interfaces:** none (dev-only data + docs).

- [ ] **Step 1: Read the current dev seed to match its style**

Run: `sed -n '1,80p' lock-app/prisma/seed-dev.ts`
Expected: shows how the existing 2-property `LockMap`/`RoomState` rows are created (so the new `Passcode` rows match the same propertyIds/roomIds).

- [ ] **Step 2: Add sample passcodes for one mapped, occupied room**

Append (before the script's final success log / `main()` invocation) rows that give one room an active guest code, a backup code, and one revoked historical code — reuse a `propertyId`/`roomId` pair already created above (substitute the real values you saw in Step 1):

```typescript
  // Plan 3 demo: one room with a live guest code, a staff backup code, and history.
  const demoProperty = "210972"; // Lakeland — must match a LockMap row seeded above
  const demoRoom = "101";        // must match a seeded LockMap.roomId
  const demoLock = 7000000001n;  // must match that LockMap.lockId
  await prisma.passcode.createMany({
    data: [
      {
        reservationId: "DEMO-RES-1", propertyId: demoProperty, roomId: demoRoom, lockId: demoLock,
        keyboardPwdId: 9001n, pin: "481572",
        startTs: BigInt(Date.parse("2026-06-19T00:00:00Z")), endTs: BigInt(Date.parse("2026-06-23T23:59:59Z")),
        status: "active", type: "guest",
      },
      {
        reservationId: null, propertyId: demoProperty, roomId: demoRoom, lockId: demoLock,
        keyboardPwdId: 9002n, pin: "330077",
        startTs: 0n, endTs: 0n, status: "active", type: "backup",
      },
      {
        reservationId: "DEMO-RES-0", propertyId: demoProperty, roomId: demoRoom, lockId: demoLock,
        keyboardPwdId: 9000n, pin: "111190",
        startTs: BigInt(Date.parse("2026-06-10T00:00:00Z")), endTs: BigInt(Date.parse("2026-06-12T23:59:59Z")),
        status: "revoked", type: "guest",
      },
    ],
    skipDuplicates: true,
  });
```

- [ ] **Step 3: Run the seed and verify it inserts**

Run: `cd lock-app && npm run db:seed:dev`
Expected: completes without error; the demo room now has 3 passcode rows. (Requires `DATABASE_URL` in `lock-app/.env` — the Neon store. If unset locally, skip this step and note it; the rows will appear once seeded against Neon.)

- [ ] **Step 4: Update `todo.md`**

Mark the Phase 5 "Admin: LockMap CRUD, view/revoke/issue PINs, event log" item as done and record what Plan 3 delivered. Edit the line in `todo.md` from:

```
- [ ] 🟢 Admin: LockMap CRUD, view/revoke/issue PINs, event log
```

to:

```
- [x] 🟢 Admin code actions (Plan 3, 2026-06-20) — Door/Room detail page; guest
      reveal/revoke/manual, staff backup reveal/rotate (permanent code), sync-from-lock
      reconcile, LockMap CRUD; all permission-gated + audit-logged. Pure libs TDD
      (passcodes/reconcile/audit/door-detail). TTLock client ported. typecheck/build/tests
      green. LIVE-UNVERIFIED: needs a registered lock + reachable euapi.ttlock.com.
```

- [ ] **Step 5: Commit**

```bash
git add lock-app/prisma/seed-dev.ts todo.md
git commit -m "lock-app: seed demo passcodes + mark Plan 3 code actions done"
```

---

## Self-Review

**Spec coverage (against `2026-06-16-lock-app-dashboard-design.md`):**
- §4.4 Door/Room detail — guest code reveal/revoke/manual + sync (Tasks 6,7,9); backup panel (Task 7,9); code history (Task 5,9); battery trend → **deferred to Plan 4** (needs health-poll history; not a code action).
- §6 Staff backup code — per-lock unique, permanent (`type 2`), never auto-revoked (`type: "backup"`), reveal/rotate gated (Task 7). Offline `addType=1` vs `=2` (§12 Q1) **left as `addType=2`, explicitly noted** — not fabricated.
- §7 Permissions — every action calls `requirePermission(<perm>, propertyId)` with the exact catalog strings (Tasks 6–8); reveals + admin changes are logged regardless of role.
- §10 Reconciliation — `syncFromLock` lists lock codes and diffs (Tasks 3,7).
- §5 Activity log — every action writes one `EventLog` row with actor + `detail.outcome` (Task 4); reveals → `warning` (amber).
- §8 Data model — **no schema change**; all columns pre-exist (verified against `schema.prisma`).
- **Not in this plan (correct):** Alerts engine + crons (Plan 4), Users/Roles/Settings UI (Plan 5), guest PIN delivery (middleware), battery-trend history.

**Placeholder scan:** none — every code step is complete. Two honest live-verify flags remain (TTLock `listKeyboardPwd` path in Task 1; `addType` choice in §6) — these are "verify against vendor docs," not plan gaps.

**Type consistency:** `keyboardPwdType` is `2|3` everywhere; `lockId` is `BigInt` in DB / `string` at boundaries; keyboardPwdIds diffed as `string` in `detectDrift`; `Outcome` strings match Plan 2's reader; permission strings match `permissions.ts` exactly; action signatures in the Task 6/7/8 Interfaces match their use in the Task 9 page.

---

## Execution Handoff

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks in this session with checkpoints.
