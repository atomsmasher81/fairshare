import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { notifyPayment } = require('@/lib/telegram-notifications')

/**
 * POST { friendId, direction: 'i_paid' | 'they_paid', amount (paise), date?, paymentMethodId?, groupId? }
 * With groupId the payment is recorded in that group only (group settle-up screen).
 */
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const { friendId, direction, amount, date, paymentMethodId, groupId } = await request.json()
    const friends = await ledger.listFriends(prisma, userId)
    if (!friends.some((f: { id: string }) => f.id === friendId)) return NextResponse.json({ error: 'Friend not found' }, { status: 404 })
    const fromId = direction === 'they_paid' ? friendId : userId
    const toId = direction === 'they_paid' ? userId : friendId
    const amt = Math.round(Number(amount))
    const when = date ? new Date(`${date}T12:00:00+05:30`) : new Date()
    if (groupId) {
      const members = await prisma.groupMember.count({ where: { groupId, userId: { in: [fromId, toId] }, group: { deletedAt: null } } })
      if (members !== 2) return NextResponse.json({ error: 'Both people must be in the group' }, { status: 400 })
      if (!Number.isInteger(amt) || amt <= 0) return NextResponse.json({ error: 'Enter an amount' }, { status: 400 })
      const s = await prisma.settlement.create({ data: { groupId, fromUserId: fromId, toUserId: toId, amount: amt, date: when } })
      await prisma.activity.create({ data: { groupId, userId, type: 'settlement', metadata: JSON.stringify({ settlementId: s.id, fromUserId: fromId, toUserId: toId, amount: amt }) } })
    } else {
      await ledger.recordSettlement(prisma, { userId, fromId, toId, amount: amt, date: when, paymentMethodId })
    }
    notifyPayment({ prisma, actorId: userId, fromUserId: fromId, toUserId: toId, amount: amt }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
