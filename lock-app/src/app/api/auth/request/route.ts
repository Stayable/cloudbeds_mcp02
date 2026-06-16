import { createMagicLink } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 });

  // Always 200 (don't leak which emails exist). Only mint a link for known users.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createMagicLink(email);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
    // Plan 1 stub: log the link. Plan 5 wires nodemailer (reuse client-portal/email.ts).
    console.log(`[magic-link] ${email} -> ${url}`);
  }
  return Response.json({ ok: true });
}
