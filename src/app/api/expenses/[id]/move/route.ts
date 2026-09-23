import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require('@/lib/ledger')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notifyExpenseSplitMembers } = require('@/lib/telegram-notifications')

// POST { groupId: string|null, description?, category? } -> move/confirm an expense (null = personal)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  try {
    const updated = await ledger.moveExpense(prisma, {
      expenseId: id, userId: session.userId, groupId: body.groupId || null,
      description: body.description?.trim() || undefined, category: body.category || undefined,
    })
    if (!updated.group.isPersonal) {
      await notifyExpenseSplitMembers({ prisma, expense: updated, group: updated.group, excludeUserIds: [session.userId] })
    }
    return NextResponse.json({ ok: true, message: ledger.describeExpense(updated) })
  } catch (e: unknown) {
    const err = e as { publicMessage?: string; status?: number }
    return NextResponse.json({ error: err.publicMessage || 'Failed' }, { status: err.status || 500 })
  }
}
