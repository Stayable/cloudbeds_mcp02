import { verifyOtp } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email, code } = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  if (!email || !code) return Response.json({ ok: false, error: "email and code required" }, { status: 400 });
  const result = await verifyOtp(email, code);
  if (!result.success) return Response.json({ ok: false, error: result.error }, { status: 401 });
  return Response.json({ ok: true });
}
