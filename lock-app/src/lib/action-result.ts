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

/** Turn an unexpected exception into operator-friendly text (never leaks raw codes). */
export function mapActionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // TTLock errcode -2012 = the lock isn't reachable through a gateway, so the
  // cloud can't push/delete a passcode. This is the common room-239 case.
  if (/-2012|not connected|gateway/i.test(msg)) {
    return "This lock isn't connected to a gateway yet, so the code couldn't be pushed to it. Get the lock online, then try again.";
  }
  return "Something went wrong while talking to the lock — please try again. If it keeps happening, check the lock's connection.";
}
