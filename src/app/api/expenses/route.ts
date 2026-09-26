import { NextRequest, NextResponse } from 'next/server'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
import { saveInput, type ExpenseInput } from '@/lib/entry'
import { prisma } from '@/lib/prisma'
/* eslint-disable @typescript-eslint/no-require-imports */
const { notifyExpenseSplitMembers } = require('@/lib/telegram-notifications')

// POST /api/expenses — create from the expense editor
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const input = (await request.json()) as ExpenseInput
    const expense = await saveInput(userId, input, 'web')
    if (!expense.group.isPersonal) {
      notifyExpenseSplitMembers({ prisma, expense, group: expense.group, excludeUserIds: [userId] }).catch(() => {})
    }
    return NextResponse.json({ ok: true, id: expense.id })
  } catch (e) {
    return fail(e)
  }
}
