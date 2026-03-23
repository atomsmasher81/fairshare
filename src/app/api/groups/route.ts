import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, generateInviteCode } from '@/lib/auth'

// GET /api/groups - List user's groups
export async function GET() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: { userId: session.userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, displayName: true, username: true },
            },
          },
        },
        _count: {
          select: { expenses: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('Error fetching groups:', error)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, description } = await request.json()

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode()
    let codeExists = true
    while (codeExists) {
      const existing = await prisma.group.findUnique({ where: { inviteCode } })
      if (!existing) {
        codeExists = false
      } else {
        inviteCode = generateInviteCode()
      }
    }

    // Create group and add creator as member
    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        inviteCode,
        createdById: session.userId,
        members: {
          create: {
            userId: session.userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, displayName: true, username: true },
            },
          },
        },
      },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        groupId: group.id,
        userId: session.userId,
        type: 'group_created',
        metadata: JSON.stringify({ groupName: group.name }),
      },
    })

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
