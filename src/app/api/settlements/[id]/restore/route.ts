import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const { notifyPaymentChange } = require('@/lib/telegram-notifications')

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const s = await prisma.settlement.findFirst({ where: { id, deletedAt: { not: null }, group: { members: { some: { userId } } } } })
  if (!s) return NextResponse.json({ error: 'Nothing to restore' }, { status: 404 })
  await prisma.settlement.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
  await prisma.activity.create({
    data: { groupId: s.groupId, userId, type: 'settlement_restored', metadata: JSON.stringify({ settlementId: id, fromUserId: s.fromUserId, toUserId: s.toUserId, amount: s.amount }) },
  })
  notifyPaymentChange({ prisma, actorId: userId, settlement: s, action: 'restored' }).catch(() => {})
  return NextResponse.json({ ok: true })
}
