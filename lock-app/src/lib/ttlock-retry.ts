import { createPasscode, type CreatePasscodeArgs } from "./ttlock";
import { generatePin } from "./passcodes";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Create a passcode, retrying with a FRESH PIN + backoff on a transient TTLock
 * failure. TTLock returns a generic errcode=1 ("failed") when a gateway-relayed
 * write doesn't land (lock briefly unreachable) or the random PIN collides with
 * an existing code on the lock (e.g. one of the backup codes) — both recover on a
 * retry with a new PIN. A real gateway/-2012 error is NOT retried (it won't
 * recover in-request). Returns the PIN that actually landed (use it for the DB row).
 */
export async function createPasscodeWithRetry(
  makeArgs: (pin: string) => CreatePasscodeArgs,
  opts: { attempts?: number; backoffMs?: number } = {},
): Promise<{ pin: string; keyboardPwdId: number }> {
  const attempts = opts.attempts ?? 3;
  const backoffMs = opts.backoffMs ?? 2000;
  let pin = generatePin();
  for (let i = 0; ; i++) {
    try {
      const { keyboardPwdId } = await createPasscode(makeArgs(pin));
      return { pin, keyboardPwdId };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (i >= attempts - 1 || /-2012|not connected|gateway/i.test(m)) throw e;
      await sleep(backoffMs);
      pin = generatePin();
    }
  }
}
