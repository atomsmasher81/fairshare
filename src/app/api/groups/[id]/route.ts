import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// GET /api/groups/[id] - Get group details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check if user is a member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId: session.userId },
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
    }

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, displayName: true, username: true },
            },
          },
        },
        expenses: {
          include: {
            paidBy: { select: { id: true, displayName: true } },
            splits: {
              include: {
                user: { select: { id: true, displayName: true } },
              },
            },
          },
          orderBy: { date: 'desc' },
          take: 20,
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error fetching group:', error)
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 })
  }
}

// DELETE /api/groups/[id] - Leave group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId: session.userId },
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
    }

    // Check if user is the only member
    const memberCount = await prisma.groupMember.count({
      where: { groupId: id },
    })

    if (memberCount === 1) {
      // Delete the entire group if last member
      await prisma.group.delete({ where: { id } })
      return NextResponse.json({ success: true, groupDeleted: true })
    }

    // Remove member and log activity
    await prisma.groupMember.delete({
      where: {
        groupId_userId: { groupId: id, userId: session.userId },
      },
    })

    await prisma.activity.create({
      data: {
        groupId: id,
        userId: session.userId,
        type: 'member_left',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error leaving group:', error)
    return NextResponse.json({ error: 'Failed to leave group' }, { status: 500 })
  }
}
