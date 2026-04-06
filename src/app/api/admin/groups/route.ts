import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    const groups = await prisma.group.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, expenses: true } },
        expenses: {
          where: { deletedAt: null },
          select: { amount: true },
        },
      },
    })

    // Calculate total amount for each group
    const groupsWithTotals = groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      inviteCode: group.inviteCode,
      createdAt: group.createdAt,
      deletedAt: group.deletedAt,
      _count: group._count,
      _sum: {
        amount: group.expenses.reduce((sum, e) => sum + e.amount, 0),
      },
    }))

    return NextResponse.json({ groups: groupsWithTotals })
  } catch (error) {
    console.error('Admin groups error:', error)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}
