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
  // Disabled/archived users are refused SILENTLY — identical to the unknown-email
  // path above, so the response shape never reveals whether an account exists.
  if (!user || user.disabledAt || user.archivedAt) return;
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

  // Re-check access at redemption: a code minted before the account was disabled
  // must not still buy a session.
  const account = await prisma.user.findUnique({ where: { id: link.userId } });
  if (!account || account.disabledAt || account.archivedAt) {
    return { success: false, error: "This account no longer has access." };
  }

  const sessionToken = jwt.sign({ userId: link.userId }, JWT_SECRET, { expiresIn: "8h" });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: link.userId, token: sessionToken, expiresAt },
  });
  // Drives the "invited, never signed in" status on the Users page.
  await prisma.user.update({
    where: { id: link.userId },
    data: { lastLoginAt: new Date() },
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
  // Disabling a user must take effect NOW, not whenever their 8-hour JWT lapses:
  // an already-signed-in user is treated as logged out on their next request.
  if (u.disabledAt || u.archivedAt) return null;
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
