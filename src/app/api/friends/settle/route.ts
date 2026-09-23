import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require('@/lib/ledger')

/**
 * POST { friendId, amount? (paise) }
 * Records a settlement with a friend across all shared groups.
 * Direction is inferred from the balance (whoever owes pays).
 * Without amount -> settles everything.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.userId
  const { friendId, amount } = await request.json().catch(() => ({}))
  const friends = await ledger.friendBalances(prisma, userId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = friends.find((x: any) => x.user.id === friendId)
  if (!f || f.net === 0) return NextResponse.json({ error: 'Nothing to settle' }, { status: 400 })

  const sign = Math.sign(f.net) // +1: friend owes me, -1: I owe friend
  let remaining = amount && amount > 0 ? Math.min(amount, Math.abs(f.net)) : Math.abs(f.net)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = f.groups.filter((g: any) => Math.sign(g.net) === sign).sort((a: any, b: any) => Math.abs(b.net) - Math.abs(a.net))

  const created = []
  for (const g of groups) {
    if (remaining <= 0) break
    const amt = Math.min(remaining, Math.abs(g.net))
    remaining -= amt
    const fromUserId = sign > 0 ? friendId : userId
    const toUserId = sign > 0 ? userId : friendId
    const s = await prisma.settlement.create({
      data: { groupId: g.id, fromUserId, toUserId, amount: amt, date: new Date(), note: 'Settled via FairShare' },
    })
    await prisma.activity.create({
      data: { groupId: g.id, userId, type: 'settlement', metadata: JSON.stringify({ settlementId: s.id, fromUserId, toUserId, amount: amt }) },
    })
    created.push(s)
  }
  return NextResponse.json({ ok: true, settlements: created.length })
}
