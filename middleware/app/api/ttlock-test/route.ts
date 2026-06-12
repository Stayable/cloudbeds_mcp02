import { getTTLockToken, listLocks } from "@/lib/ttlock";

// TTLock client uses node:crypto + fetch — needs the Node.js runtime, not edge.
export const runtime = "nodejs";
export const maxDuration = 30;
// Always run fresh; this is a live credential probe, never cache it.
export const dynamic = "force-dynamic";

/**
 * GET /api/ttlock-test
 *
 * Credential smoke test, validatable remotely with no physical lock. Confirms:
 *  1. OAuth password grant works (token returned).
 *  2. The configured client_id is the **main** app — `lockCount > 0`. A wrong
 *     ("old") app authenticates fine but reports zero locks; that is the failure
 *     mode this endpoint exists to catch.
 *
 * Returns non-sensitive diagnostics (even on failure) to pinpoint a 10007:
 * the username being sent, value lengths, and whether the password looks like it
 * was already MD5-hashed before being stored (a common double-hash mistake).
 * Never returns the full token, password, or client_secret.
 */
function diagnostics() {
  const clientId = (process.env.TTLOCK_CLIENT_ID ?? "").trim();
  const username = (process.env.TTLOCK_USERNAME ?? "").trim();
  const password = (process.env.TTLOCK_PASSWORD ?? "").trim();
  return {
    username, // the account's own login — safe to echo so format/typos are visible
    usernameLength: username.length,
    usernameLooksEmail: username.includes("@"),
    passwordLength: password.length,
    // If the stored password is already a 32-char lowercase hex string, it was
    // probably pre-MD5-hashed; our code hashes again → guaranteed 10007.
    passwordLooksPreHashed: /^[0-9a-f]{32}$/.test(password),
    clientIdPreview:
      clientId.length > 10 ? `${clientId.slice(0, 6)}…${clientId.slice(-4)}` : "set",
    apiHost: process.env.TTLOCK_BASE_URL ?? "https://euapi.ttlock.com",
  };
}

export async function GET() {
  const diag = diagnostics();
  try {
    const token = await getTTLockToken(true); // force a fresh fetch for the probe
    const { total } = await listLocks(1, 1);

    const tok = token.accessToken;
    const preview = tok.length > 12 ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : "set";

    return Response.json({
      ok: true,
      auth: "success",
      uid: token.uid,
      tokenPreview: preview,
      expiresInDays: Math.round((token.expiresAt - Date.now()) / 86_400_000),
      lockCount: total,
      isMainApp: total > 0,
      hint:
        total > 0
          ? "Locks visible — this client_id is the correct 'main' app."
          : "Auth OK but ZERO locks visible. Likely the wrong (old) client_id, OR no locks are registered to this account yet.",
      diagnostics: diag,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, auth: "failed", error: err?.message ?? String(err), diagnostics: diag },
      { status: 502 },
    );
  }
}
