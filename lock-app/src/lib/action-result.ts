/**
 * Result contract for Server Actions invoked from the UI. Instead of throwing
 * (which crashes the route with Next's generic "server-side exception" page and
 * leaves the router stuck), actions return an ActionResult and the client
 * surfaces failures in a dismissible modal. Known business failures set an
 * explicit friendly `error`; unexpected exceptions go through `mapActionError`.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * True ONLY for permanent in-request lock failures — the lock isn't reachable
 * through a gateway at all (TTLock -2012 / "not connected to a gateway"). These
 * won't recover on a retry. Transient errors — errcode 3003 "gateway is busy",
 * errcode 1 "failed", timeouts — return false so callers RETRY them. Critically,
 * this does NOT match the bare word "gateway" (so "gateway is busy" is transient).
 */
export function isUnreachableLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /-2012|not connected|no gateway/i.test(msg);
}

/** Turn an unexpected exception into operator-friendly text (never leaks raw codes). */
export function mapActionError(err: unknown): string {
  if (isUnreachableLockError(err)) {
    return "This lock isn't connected to a gateway yet, so the code couldn't be pushed to it. Get the lock online, then try again.";
  }
  return "Something went wrong while talking to the lock — please try again. If it keeps happening, check the lock's connection.";
}
