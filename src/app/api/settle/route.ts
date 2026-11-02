import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { notifyPayment } = require('@/lib/telegram-notifications')

/**
 * POST { friendId, direction: 'i_paid' | 'they_paid', amount (paise), date?, paymentMethodId?, groupId? }
 *   or { groupId, fromId, toId, amount, date?, paymentMethodId? } — any member records a payment between
 *   any two members of the group (group settle-up screen).
 * With groupId the payment is recorded in that group only.
 */
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const body = await request.json()
    const { friendId, direction, amount, date, paymentMethodId, groupId } = body
    const amt = Math.round(Number(amount))
    const when = date ? new Date(`${date}T12:00:00+05:30`) : new Date()
    let fromId: string
    let toId: string
    if (groupId && body.fromId && body.toId) {
      fromId = String(body.fromId)
      toId = String(body.toId)
    } else {
      const friends = await ledger.listFriends(prisma, userId)
      if (!friends.some((f: { id: string }) => f.id === friendId)) return NextResponse.json({ error: 'Friend not found' }, { status: 404 })
      fromId = direction === 'they_paid' ? friendId : userId
      toId = direction === 'they_paid' ? userId : friendId
    }
    if (groupId) {
      await ledger.recordGroupSettlement(prisma, { userId, groupId, fromId, toId, amount: amt, date: when, paymentMethodId })
    } else {
      await ledger.recordSettlement(prisma, { userId, fromId, toId, amount: amt, date: when, paymentMethodId })
    }
    notifyPayment({ prisma, actorId: userId, fromUserId: fromId, toUserId: toId, amount: amt }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
