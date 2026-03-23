import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { username, password, displayName } = await request.json()

    // Validation
    if (!username || !password || !displayName) {
      return NextResponse.json(
        { error: 'Username, password, and display name are required' },
        { status: 400 }
      )
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
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
