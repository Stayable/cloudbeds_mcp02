import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createMagicLink } from '@/lib/auth'
import { sendMagicLinkEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json({
        message: 'If an account exists, a magic link has been sent',
      })
    }

    // Create magic link
    const token = await createMagicLink(email.toLowerCase())

    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`

    // Send email
    try {
      await sendMagicLinkEmail(email.toLowerCase(), token)
    } catch (emailError) {
      console.error('Failed to send email:', emailError)
      // In development, log the magic link for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log('Magic link token:', token)
        console.log('Verify URL:', verifyUrl)
      }
    }

    // In development, return the verify URL so the user can sign in without email
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({
        message: 'If an account exists, a magic link has been sent',
        devVerifyUrl: verifyUrl,
      })
    }

    return NextResponse.json({
      message: 'If an account exists, a magic link has been sent',
    })
  } catch (error) {
    console.error('Magic link error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
