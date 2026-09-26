import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'

// POST — undo a delete
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const e = await prisma.expense.findFirst({ where: { id, deletedAt: { not: null }, group: { members: { some: { userId } } } } })
  if (!e) return NextResponse.json({ error: 'Nothing to restore' }, { status: 404 })
  await prisma.expense.update({ where: { id }, data: { deletedAt: null } })
  await prisma.activity.create({ data: { groupId: e.groupId, userId, type: 'expense_restored', metadata: JSON.stringify({ expenseId: id, description: e.description }) } })
  return NextResponse.json({ ok: true })
}
