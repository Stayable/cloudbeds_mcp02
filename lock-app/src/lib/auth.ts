import { cookies } from "next/headers";
import { prisma } from "./db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { generateOtpCode, otpMatches } from "./otp";
import { sendOtpEmail } from "./email";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleName: string;
  permissions: string[];
  scopeType: "all" | "group" | "property";
  propertyIds: string[];
}

export async function createOtp(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // don't leak which emails exist
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.magicLink.create({
    data: { email, token: uuidv4(), code, expiresAt, userId: user.id },
  });
  // Deliver via Resend. If email fails (or isn't configured), log the code so
  // login never hard-fails — the code is still valid from the DB row above.
  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error(`[otp] email delivery failed for ${email}:`, err);
    console.log(`[otp] ${email} -> ${code}`);
  }
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const link = await prisma.magicLink.findFirst({
    where: { email, used: false },
    orderBy: { createdAt: "desc" },
  });
  if (!link || !link.userId) return { success: false, error: "Invalid code" };
  if (!otpMatches({ code: link.code, used: link.used, expiresAt: link.expiresAt }, code, new Date())) {
    return { success: false, error: "Invalid or expired code" };
  }
  await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });

  const sessionToken = jwt.sign({ userId: link.userId }, JWT_SECRET, { expiresIn: "8h" });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: link.userId, token: sessionToken, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return { success: true };
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  if (!sessionToken) return null;
  try {
    jwt.verify(sessionToken, JWT_SECRET);
  } catch {
    return null;
  }
  const session = await prisma.session.findFirst({
    where: { token: sessionToken, expiresAt: { gt: new Date() } },
    include: { user: { include: { role: true } } },
  });
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleName: u.role.name,
    permissions: u.role.permissions,
    scopeType: u.scopeType as SessionUser["scopeType"],
    propertyIds: u.propertyIds,
  };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookieStore.delete("session");
}
