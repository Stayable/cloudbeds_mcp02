import { NextResponse } from "next/server";
import { PROPERTIES } from "@/lib/properties";
import { syncOccupancy } from "@/lib/occupancy-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled occupancy rehydrate (Vercel cron — see vercel.json). Re-syncs every
 * property's RoomState from Cloudbeds so occupancy can't drift away from the PMS
 * between webhook events. When CRON_SECRET is set, Vercel sends it as a bearer
 * token; we reject anything else so the endpoint isn't publicly triggerable.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const results = await syncOccupancy(PROPERTIES.map((p) => p.id));
  const occupied = results.reduce((n, r) => n + r.occupied, 0);
  const freed = results.reduce((n, r) => n + r.freed, 0);
  const errors = results.filter((r) => r.error).map((r) => ({ propertyId: r.propertyId, error: r.error }));
  return NextResponse.json({ ok: true, occupied, freed, properties: results.length, errors, results });
}
