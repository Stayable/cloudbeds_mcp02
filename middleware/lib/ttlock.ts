/**
 * TTLock Cloud API client — RISE8 / Stayable.
 *
 * One TTLock account, one Application ("Stayable Access — main") owns every lock
 * across all 8 properties. Lock IDs are globally unique within the account, so no
 * per-property routing here (unlike the Cloudbeds 8-account model).
 *
 * Auth is OAuth2 password grant with an MD5-hashed password (TTLock requirement).
 * Tokens last ~90 days; we cache the token in-process and re-fetch on expiry.
 * (A durable cache / scheduled refresh is a tracked follow-up — see the spec.)
 *
 * EU API gateway: euapi.ttlock.com. (Note: euopen.ttlock.com is the developer
 * PORTAL/docs where the app/client_id is registered — it is NOT the API host and
 * returns 404 on /oauth2/token. All token + /v3 calls go to euapi.ttlock.com.)
 */

import { createHash } from "node:crypto";

const TTLOCK_BASE = process.env.TTLOCK_BASE_URL ?? "https://euapi.ttlock.com";

// Refresh a little before the real expiry so we never present a stale token.
const EXPIRY_SKEW_MS = 5 * 60 * 1000; // 5 minutes

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  uid: number;
  /** Absolute epoch-ms after which the token must be re-fetched. */
  expiresAt: number;
}

// Module-level cache. Survives within a warm serverless instance; a cold start
// simply re-authenticates, which is cheap relative to the ~90-day token life.
let cached: CachedToken | null = null;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  // Trim: pasting secrets into a dashboard often leaves trailing whitespace or a
  // stray newline, which silently breaks the MD5 password and yields a 10007.
  return v.trim();
}

/** TTLock requires the account password as a lowercase MD5 hex digest. */
function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

/**
 * TTLock returns HTTP 200 even on logical errors, carrying an `errcode` in the
 * body (0 = success). Normalize that into a thrown Error for non-zero codes.
 */
function assertOk(body: any, context: string): void {
  if (body && typeof body.errcode === "number" && body.errcode !== 0) {
    throw new Error(
      `TTLock ${context} failed: errcode=${body.errcode} ${body.errmsg ?? ""}`.trim(),
    );
  }
}

async function postForm(path: string, params: Record<string, string | number>): Promise<any> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    form.set(k, String(v));
  }
  const res = await fetch(`${TTLOCK_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new Error(`TTLock ${path} HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch (or return the cached) TTLock OAuth access token.
 * Uses the password grant with an MD5-hashed password.
 */
export async function getTTLockToken(force = false): Promise<CachedToken> {
  if (!force && cached && Date.now() < cached.expiresAt - EXPIRY_SKEW_MS) {
    return cached;
  }

  const clientId = requiredEnv("TTLOCK_CLIENT_ID");
  const clientSecret = requiredEnv("TTLOCK_CLIENT_SECRET");
  const username = requiredEnv("TTLOCK_USERNAME");
  const password = requiredEnv("TTLOCK_PASSWORD");

  const body = await postForm("/oauth2/token", {
    clientId,
    clientSecret,
    username,
    password: md5(password),
    grant_type: "password",
  });

  // The token endpoint reports failure via `errcode`, not `errcode === 0`.
  if (!body.access_token) {
    throw new Error(
      `TTLock auth failed: ${body.errcode ?? "?"} ${body.errmsg ?? "no access_token returned"}`,
    );
  }

  cached = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    uid: body.uid,
    // expires_in is in seconds.
    expiresAt: Date.now() + Number(body.expires_in) * 1000,
  };
  return cached;
}

/**
 * Count locks visible to this Application. CRITICAL CHECK: if the client_id is
 * an "old" app instead of `main`, auth succeeds but this returns 0 — that is the
 * symptom the spec warns about. A non-zero count confirms the right app.
 */
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
 * Full detail for a single lock. /v3/lock/detail returns more than the list
 * row — firmware/model, battery, timezone, and a `featureValue` bitmask that
 * encodes which capabilities (remote unlock, passcode, IC card, fingerprint,
 * gateway, audit records, etc.) the hardware actually supports.
 */
export async function getLockDetail(lockId: number | bigint): Promise<any> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/detail", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    date: Date.now(),
  });
  assertOk(body, "lock/detail");
  return body;
}

/** Current battery percentage for a lock (0–100). */
export async function getBattery(lockId: number | bigint): Promise<number> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/queryElectricQuantity", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    date: Date.now(),
  });
  assertOk(body, "lock/queryElectricQuantity");
  return body.electricQuantity ?? -1;
}

/**
 * Query whether a lock is currently locked/unlocked. REQUIRES a gateway (or the
 * lock must be a WiFi lock) — a pure-Bluetooth lock with no gateway returns an
 * error because the cloud can't reach it. state: 0=locked, 1=unlocked, 2=unknown.
 */
export async function getOpenState(lockId: number | bigint): Promise<{ state: number }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/queryOpenState", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    date: Date.now(),
  });
  assertOk(body, "lock/queryOpenState");
  return { state: body.state ?? 2 };
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

/** Gateways a specific lock can talk through (each carries its own isOnline). */
export async function listGatewaysForLock(lockId: number | bigint): Promise<any[]> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lock/listGateway", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    date: Date.now(),
  });
  assertOk(body, "lock/listGateway");
  return body.list ?? [];
}

/** Existing keyboard passcodes on a lock (what PINs are currently provisioned). */
export async function listPasscodes(
  lockId: number | bigint,
  pageNo = 1,
  pageSize = 100,
): Promise<{ total: number; list: any[] }> {
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
  return { total: body.total ?? 0, list: body.list ?? [] };
}

/**
 * Unlock/access history for a lock (the audit trail): who opened it, how
 * (passcode / app / IC card / fingerprint), and when. recordType filters the
 * source; omit for everything. Needs a gateway to be uploaded to the cloud.
 */
export async function listLockRecords(
  lockId: number | bigint,
  startDate: number,
  endDate: number,
  pageNo = 1,
  pageSize = 100,
): Promise<{ total: number; list: any[] }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/lockRecord/list", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(lockId),
    startDate,
    endDate,
    pageNo,
    pageSize,
    date: Date.now(),
  });
  assertOk(body, "lockRecord/list");
  return { total: body.total ?? 0, list: body.list ?? [] };
}

/**
 * Rename a lock in the TTLock account (sets lockAlias). Used by the lock-app to
 * apply the <ABBR>-<room> convention from the Unassigned queue so the TTLock name
 * stays the source of truth — no need to open the TTLock app. Mirrored here to
 * keep the two ttlock.ts clients identical.
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
  /** 4-9 digit PIN. */
  passcode: string;
  /** Validity window, epoch-ms. */
  startDate: number;
  endDate: number;
  /** Optional human label shown in the TTLock app. */
  name?: string;
}

/**
 * Create a period (time-limited) keyboard passcode on a lock.
 * keyboardPwdType=3 => period passcode. addType=2 => push via gateway/WiFi.
 * Returns the `keyboardPwdId`, which MUST be stored to delete the PIN later.
 */
export async function createPasscode(args: CreatePasscodeArgs): Promise<{ keyboardPwdId: number }> {
  const { accessToken } = await getTTLockToken();
  const body = await postForm("/v3/keyboardPwd/add", {
    clientId: requiredEnv("TTLOCK_CLIENT_ID"),
    accessToken,
    lockId: String(args.lockId),
    keyboardPwd: args.passcode,
    keyboardPwdName: args.name ?? "",
    keyboardPwdType: 3,
    startDate: args.startDate,
    endDate: args.endDate,
    addType: 2,
    date: Date.now(),
  });
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

/** Delete a previously created passcode. deleteType=2 => via gateway/WiFi. */
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
