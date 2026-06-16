import { cookies } from "next/headers";
import { prisma } from "./db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

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

export async function createMagicLink(email: string): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.magicLink.create({
    data: { email, token, expiresAt, userId: user?.id ?? null },
  });
  return token;
}

export async function verifyMagicLink(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const link = await prisma.magicLink.findUnique({ where: { token } });
  if (!link) return { success: false, error: "Invalid link" };
  if (link.used) return { success: false, error: "Link already used" };
  if (link.expiresAt < new Date()) return { success: false, error: "Link expired" };
  if (!link.userId) return { success: false, error: "User not found" };

  await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });

  const sessionToken = jwt.sign({ userId: link.userId }, JWT_SECRET, { expiresIn: "8h" });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h per spec §10 (old) / internal ops

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
