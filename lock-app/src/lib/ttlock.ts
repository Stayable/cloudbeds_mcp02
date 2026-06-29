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

/**
 * Rename a lock in the TTLock account (sets lockAlias). Used by the lock-app to
 * apply the <ABBR>-<room> convention from the Unassigned queue so the TTLock name
 * stays the source of truth — no need to open the TTLock app.
 */
export async function renameLock(lockId: number | bigint, name: string): Promise<void> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/rename", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    lockAlias: name,
    date: Date.now(),
  });
  assertOk(body, "lock/rename");
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

export interface ChangePasscodePeriodArgs {
  lockId: number | bigint;
  keyboardPwdId: number | bigint;
  /** New validity window, epoch-ms. */
  startDate: number;
  endDate: number;
}

/**
 * Change an existing passcode's validity window WITHOUT changing the digits
 * (stay extension: same PIN, later checkout). changeType=2 => via gateway/WiFi.
 * Mirrored from middleware/lib/ttlock.ts — keep the two clients in sync.
 */
export async function changePasscodePeriod(args: ChangePasscodePeriodArgs): Promise<void> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/keyboardPwd/changePeriod", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(args.lockId),
    keyboardPwdId: String(args.keyboardPwdId),
    startDate: args.startDate,
    endDate: args.endDate,
    changeType: 2,
    date: Date.now(),
  });
  assertOk(body, "keyboardPwd/changePeriod");
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

/** Gateways the account owns. isOnline + lockNum tell us bridge health/coverage. */
export async function listGateways(pageNo = 1, pageSize = 100): Promise<{ total: number; list: any[] }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/gateway/list", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    pageNo,
    pageSize,
    date: Date.now(),
  });
  assertOk(body, "gateway/list");
  return { total: body.total ?? 0, list: body.list ?? [] };
}

/** Locks bound to a gateway. We iterate gateways (few) not locks (~1,450). */
export async function listLocksForGateway(gatewayId: number | bigint, pageNo = 1, pageSize = 100): Promise<{ total: number; list: any[] }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/gateway/listLock", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    gatewayId: String(gatewayId),
    pageNo,
    pageSize,
    date: Date.now(),
  });
  assertOk(body, "gateway/listLock");
  return { total: body.total ?? 0, list: body.list ?? [] };
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
