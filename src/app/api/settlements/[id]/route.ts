import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const { notifyPaymentChange } = require('@/lib/telegram-notifications')

// DELETE — soft delete a payment; it stops counting but stays in history and can be restored
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const s = await prisma.settlement.findFirst({ where: { id, deletedAt: null, group: { members: { some: { userId } } } } })
  if (!s) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } })
  await prisma.activity.create({
    data: { groupId: s.groupId, userId, type: 'settlement_deleted', metadata: JSON.stringify({ settlementId: id, fromUserId: s.fromUserId, toUserId: s.toUserId, amount: s.amount }) },
  })
  notifyPaymentChange({ prisma, actorId: userId, settlement: s, action: 'deleted' }).catch(() => {})
  return NextResponse.json({ ok: true })
}
