import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// POST /api/groups/[id]/settle - Record a settlement
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params
    const { fromUserId, toUserId, amount, note, date } = await request.json()

    // Validation
    if (!fromUserId || !toUserId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid settlement data' }, { status: 400 })
    }

    if (fromUserId === toUserId) {
      return NextResponse.json({ error: 'Cannot settle with yourself' }, { status: 400 })
    }

    // Check membership for both users
    const members = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { in: [fromUserId, toUserId] },
      },
    })

    if (members.length !== 2) {
      return NextResponse.json({ error: 'Both users must be group members' }, { status: 400 })
    }

    // Create settlement
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        fromUserId,
        toUserId,
        amount,
        note: note || null,
        date: new Date(date || Date.now()),
      },
      include: {
        fromUser: { select: { id: true, displayName: true } },
        toUser: { select: { id: true, displayName: true } },
      },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        groupId,
        userId: session.userId,
        type: 'settlement',
        metadata: JSON.stringify({
          settlementId: settlement.id,
          fromUserId: settlement.fromUserId,
          toUserId: settlement.toUserId,
          amount: settlement.amount,
        }),
      },
    })

    return NextResponse.json({ settlement })
  } catch (error) {
    console.error('Error creating settlement:', error)
    return NextResponse.json({ error: 'Failed to create settlement' }, { status: 500 })
  }
}

// GET /api/groups/[id]/settle - Get settlements history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: groupId } = await params

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: session.userId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        fromUser: { select: { id: true, displayName: true } },
        toUser: { select: { id: true, displayName: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ settlements })
  } catch (error) {
    console.error('Error fetching settlements:', error)
    return NextResponse.json({ error: 'Failed to fetch settlements' }, { status: 500 })
  }
}
