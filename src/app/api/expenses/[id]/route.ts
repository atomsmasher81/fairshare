import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
import { saveInput, type ExpenseInput } from '@/lib/entry'
/* eslint-disable @typescript-eslint/no-require-imports */
const { notifyExpenseSplitMembers } = require('@/lib/telegram-notifications')

type Ctx = { params: Promise<{ id: string }> }

async function findForUser(id: string, userId: string) {
  return prisma.expense.findFirst({
    where: { id, deletedAt: null, group: { members: { some: { userId } } } },
    include: {
      paidBy: { select: { id: true, displayName: true } },
      splits: { include: { user: { select: { id: true, displayName: true } } } },
      group: { select: { id: true, name: true, isPersonal: true, isDirect: true } },
      paymentMethod: { select: { id: true, name: true } },
    },
  })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const expense = await findForUser((await params).id, userId)
  if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  return NextResponse.json({ expense })
}

// PATCH — full edit from the expense editor
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const input = (await request.json()) as ExpenseInput
    const expense = await saveInput(userId, input, 'web', (await params).id)
    if (!expense.group.isPersonal) {
      notifyExpenseSplitMembers({ prisma, expense, group: expense.group, excludeUserIds: [userId], action: 'edited' }).catch(() => {})
    }
    return NextResponse.json({ ok: true, id: expense.id })
  } catch (e) {
    return fail(e)
  }
}

// DELETE — soft delete (restorable via /restore)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const existing = await findForUser((await params).id, userId)
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  await prisma.expense.update({ where: { id: existing.id }, data: { deletedAt: new Date(), deletedById: userId } })
  await prisma.activity.create({
    data: { groupId: existing.groupId, userId, type: 'expense_deleted', metadata: JSON.stringify({ expenseId: existing.id, description: existing.description, amount: existing.amount }) },
  })
  if (!existing.group.isPersonal) {
    notifyExpenseSplitMembers({ prisma, expense: existing, group: existing.group, excludeUserIds: [userId], action: 'deleted' }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
