import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, getSession } from '@/lib/auth'
import { rateLimited } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (rateLimited(`register:${ip}`, 8, 60 * 60e3)) {
      return NextResponse.json({ error: 'Too many sign-ups from here — try later' }, { status: 429 })
    }
    const body = await request.json()
    const username = String(body.username || '').trim().toLowerCase().replace(/^@/, '')
    const password = String(body.password || '')
    const displayName = String(body.displayName || '').trim().replace(/\s+/g, ' ').slice(0, 40)

    // Validation
    if (!username || !password || !displayName) {
      return NextResponse.json(
        { error: 'Username, password, and display name are required' },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9_.]{3,24}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username: 3–24 letters, numbers, dots or underscores' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }

    // Check if this is the first user (make them admin)
    const userCount = await prisma.user.count()
    const isFirstUser = userCount === 0

    // Create user
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        passwordHash,
        displayName,
        isAdmin: isFirstUser,
      },
    })

    // Create session
    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.isAdmin = user.isAdmin
    session.isLoggedIn = true
    await session.save()

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    )
  }
}
