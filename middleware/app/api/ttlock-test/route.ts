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
 * Never returns the full token or any secret — only previews and a count.
 */
export async function GET() {
  try {
    const token = await getTTLockToken(true); // force a fresh fetch for the probe
    const { total } = await listLocks(1, 1);

    const tok = token.accessToken;
    const preview = tok.length > 12 ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : "set";
    const clientId = process.env.TTLOCK_CLIENT_ID ?? "";
    const clientIdPreview =
      clientId.length > 10 ? `${clientId.slice(0, 6)}…${clientId.slice(-4)}` : "set";

    return Response.json({
      ok: true,
      auth: "success",
      username: process.env.TTLOCK_USERNAME ?? null,
      uid: token.uid,
      clientIdPreview,
      tokenPreview: preview,
      expiresInDays: Math.round((token.expiresAt - Date.now()) / 86_400_000),
      lockCount: total,
      isMainApp: total > 0,
      hint:
        total > 0
          ? "Locks visible — this client_id is the correct 'main' app."
          : "Auth OK but ZERO locks visible. Likely the wrong (old) client_id, OR no locks are registered to this account yet.",
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, auth: "failed", error: err?.message ?? String(err) },
      { status: 502 },
    );
  }
}
