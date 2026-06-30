import { NextResponse } from "next/server";
import { syncGateways } from "@/lib/gateway-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled gateway-status refresh (Vercel cron — see vercel.json). Re-reads every
 * gateway from TTLock so the app's online/offline + lock→gateway links stay current
 * without anyone clicking "Sync". This also self-heals a lock's gatewayId after a
 * room transfer (the assign action carries it; this is the backstop). When
 * CRON_SECRET is set, Vercel sends it as a bearer token; we reject anything else so
 * the endpoint isn't publicly triggerable.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await syncGateways();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
