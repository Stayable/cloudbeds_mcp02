import { createOtp } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 });
  await createOtp(email); // always 200; only mints for known users
  return Response.json({ ok: true });
}
