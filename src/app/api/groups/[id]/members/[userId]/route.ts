import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// DELETE /api/groups/[id]/members/[userId] - Remove a member from a group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId, userId: targetUserId } = await params

    const group = await prisma.group.findUnique({
      where: { id: groupId, deletedAt: null },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const requesterMembership = group.members.find(member => member.userId === session.userId)
    if (!requesterMembership && !session.isAdmin) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
    }

    const canManageMembers = session.isAdmin || group.createdById === session.userId
    if (!canManageMembers) {
      return NextResponse.json({ error: 'Only the group creator or an admin can remove members' }, { status: 403 })
    }

    if (targetUserId === session.userId) {
      return NextResponse.json({ error: 'Use leave group to remove yourself' }, { status: 400 })
    }

    if (targetUserId === group.createdById) {
      return NextResponse.json({ error: 'The group creator cannot be removed' }, { status: 400 })
    }

    if (group.members.length <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last group member' }, { status: 400 })
    }

    const targetMembership = group.members.find(member => member.userId === targetUserId)
    if (!targetMembership) {
      return NextResponse.json({ error: 'Member not found in this group' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId, userId: targetUserId } },
      })

      await tx.activity.create({
        data: {
          groupId,
          userId: session.userId!,
          type: 'member_removed',
          metadata: JSON.stringify({
            removedUserId: targetUserId,
            removedDisplayName: targetMembership.user.displayName,
          }),
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing group member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
