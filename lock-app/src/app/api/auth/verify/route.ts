import { verifyMagicLink } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = await verifyMagicLink(token);
  const dest = result.success ? "/" : `/login?error=${encodeURIComponent(result.error ?? "failed")}`;
  return Response.redirect(new URL(dest, process.env.NEXT_PUBLIC_APP_URL), 302);
}
