import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
import { saveDraft, type Draft } from '@/lib/entry'
/* eslint-disable @typescript-eslint/no-require-imports */
const { notifyExpenseSplitMembers, notifyPayment } = require('@/lib/telegram-notifications')

// POST { draft } — save a previewed draft
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const { draft } = (await request.json()) as { draft: Draft }
    const saved = await saveDraft(userId, draft, draft.via === 'ai' ? 'ai' : 'web')
    if (saved.expense && !saved.expense.group.isPersonal) {
      notifyExpenseSplitMembers({ prisma, expense: saved.expense, group: saved.expense.group, excludeUserIds: [userId] }).catch(() => {})
    }
    if (draft.kind === 'settlement' && draft.toUserId) {
      notifyPayment({ prisma, actorId: userId, fromUserId: draft.paidById, toUserId: draft.toUserId, amount: draft.amount }).catch(() => {})
    }
    return NextResponse.json({ ok: true, message: saved.message, id: saved.expense?.id || null })
  } catch (e) {
    return fail(e)
  }
}
