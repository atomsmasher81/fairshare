import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// POST /api/groups/join/[code] - Join group via invite code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params

    // Find group by invite code
    const group = await prisma.group.findUnique({
      where: { inviteCode: code.toUpperCase() },
    })

    if (!group) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    // Check if already a member
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: group.id, userId: session.userId },
      },
    })

    if (existingMembership) {
      return NextResponse.json({ error: 'Already a member of this group', groupId: group.id }, { status: 400 })
    }

    // Add as member
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: session.userId,
      },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        groupId: group.id,
        userId: session.userId,
        type: 'member_joined',
      },
    })

    return NextResponse.json({ 
      success: true, 
      groupId: group.id,
      groupName: group.name,
    })
  } catch (error) {
    console.error('Error joining group:', error)
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 })
  }
}

// GET /api/groups/join/[code] - Get group info from invite code (for preview)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const group = await prisma.group.findUnique({
      where: { inviteCode: code.toUpperCase() },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { members: true } },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error fetching group info:', error)
    return NextResponse.json({ error: 'Failed to fetch group info' }, { status: 500 })
  }
}
