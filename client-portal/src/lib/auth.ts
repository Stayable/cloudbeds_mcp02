import { cookies } from 'next/headers'
import { prisma } from './db'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me'
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'magic-link-secret'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'INVESTOR' | 'ADMIN'
}

export async function createMagicLink(email: string): Promise<string> {
  const token = uuidv4()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

  await prisma.magicLink.create({
    data: {
      email,
      token,
      expiresAt,
    },
  })

  return token
}

export async function verifyMagicLink(token: string): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  const magicLink = await prisma.magicLink.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!magicLink) {
    return { success: false, error: 'Invalid link' }
  }

  if (magicLink.used) {
    return { success: false, error: 'Link already used' }
  }

  if (magicLink.expiresAt < new Date()) {
    return { success: false, error: 'Link expired' }
  }

  if (!magicLink.user) {
    return { success: false, error: 'User not found' }
  }

  // Mark as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { used: true },
  })

  // Create session
  const sessionToken = jwt.sign(
    { userId: magicLink.user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await prisma.session.create({
    data: {
      userId: magicLink.user.id,
      token: sessionToken,
      expiresAt: sessionExpiresAt,
    },
  })

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: sessionExpiresAt,
    path: '/',
  })

  return {
    success: true,
    user: {
      id: magicLink.user.id,
      email: magicLink.user.email,
      name: magicLink.user.name,
      role: magicLink.user.role,
    },
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (!sessionToken) {
    return null
  }

  try {
    const decoded = jwt.verify(sessionToken, JWT_SECRET) as { userId: string }

    const session = await prisma.session.findFirst({
      where: {
        token: sessionToken,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    })

    if (!session) {
      return null
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    }
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (sessionToken) {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    })
  }

  cookieStore.delete('session')
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden')
  }
  return user
}
