import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// GET /api/expenses/[id] - Get expense details
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

    const expense = await prisma.expense.findUnique({
      where: { id, deletedAt: null },
      include: {
        paidBy: { select: { id: true, displayName: true } },
        splits: {
          include: { user: { select: { id: true, displayName: true } } },
        },
        group: {
          include: {
            members: { include: { user: { select: { id: true, displayName: true } } } },
          },
        },
      },
    })

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Check if user is a member of the group
    const isMember = expense.group.members.some(m => m.userId === session.userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    return NextResponse.json({ expense })
  } catch (error) {
    console.error('Get expense error:', error)
    return NextResponse.json({ error: 'Failed to get expense' }, { status: 500 })
  }
}

// PUT /api/expenses/[id] - Update expense
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { description, amount, category, date, paidById, splits } = await request.json()

    // Get existing expense
    const existing = await prisma.expense.findUnique({
      where: { id, deletedAt: null },
      include: { group: { include: { members: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Check if user is a member
    const isMember = existing.group.members.some(m => m.userId === session.userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Update expense and splits in a transaction
    const expense = await prisma.$transaction(async (tx) => {
      // Delete old splits
      await tx.expenseSplit.deleteMany({ where: { expenseId: id } })

      // Update expense with new splits
      const updated = await tx.expense.update({
        where: { id },
        data: {
          description,
          amount,
          category,
          date: new Date(date),
          paidById,
          splits: {
            create: splits.map((s: { userId: string; amount: number }) => ({
              userId: s.userId,
              amount: s.amount,
            })),
          },
        },
        include: {
          paidBy: { select: { id: true, displayName: true } },
          splits: { include: { user: { select: { id: true, displayName: true } } } },
        },
      })

      // Log activity
      await tx.activity.create({
        data: {
          groupId: existing.groupId,
          userId: session.userId!,
          type: 'expense_edited',
          metadata: JSON.stringify({ expenseId: id, description, amount }),
        },
      })

      return updated
    })

    return NextResponse.json({ expense })
  } catch (error) {
    console.error('Update expense error:', error)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

// DELETE /api/expenses/[id] - Soft delete expense
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

    // Get existing expense
    const existing = await prisma.expense.findUnique({
      where: { id, deletedAt: null },
      include: { group: { include: { members: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Check if user is a member
    const isMember = existing.group.members.some(m => m.userId === session.userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Soft delete
    await prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        groupId: existing.groupId,
        userId: session.userId!,
        type: 'expense_deleted',
        metadata: JSON.stringify({ expenseId: id, description: existing.description }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete expense error:', error)
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
