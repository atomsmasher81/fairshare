import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// GET /api/groups/[id]/expenses - List expenses
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

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, displayName: true } },
        splits: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ expenses })
  } catch (error) {
    console.error('Error fetching expenses:', error)
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

// POST /api/groups/[id]/expenses - Create expense
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
    const { description, amount, category, date, paidById, splits } = await request.json()

    // Validation
    if (!description || !amount || !paidById || !splits || splits.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: session.userId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Validate splits sum equals amount
    const splitTotal = splits.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0)
    if (splitTotal !== amount) {
      return NextResponse.json({ error: 'Splits must equal total amount' }, { status: 400 })
    }

    // Create expense with splits
    const expense = await prisma.expense.create({
      data: {
        groupId,
        description,
        amount,
        category: category || 'other',
        date: new Date(date || Date.now()),
        paidById,
        createdById: session.userId,
        splits: {
          create: splits.map((s: { userId: string; amount: number }) => ({
            userId: s.userId,
            amount: s.amount,
          })),
        },
      },
      include: {
        paidBy: { select: { id: true, displayName: true } },
        splits: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        groupId,
        userId: session.userId,
        type: 'expense_added',
        metadata: JSON.stringify({
          expenseId: expense.id,
          description: expense.description,
          amount: expense.amount,
        }),
      },
    })

    return NextResponse.json({ expense })
  } catch (error) {
    console.error('Error creating expense:', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
