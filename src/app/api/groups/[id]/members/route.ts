import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

// POST { userId } (an existing friend) or { name } (new placeholder friend) — add to the group
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id: groupId } = await params
  try {
    const group = await prisma.group.findFirst({ where: { id: groupId, deletedAt: null, isPersonal: false, isDirect: false, members: { some: { userId } } } })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    const body = await request.json().catch(() => ({}))
    let friendId: string
    if (body.userId) {
      const friends = await ledger.listFriends(prisma, userId)
      if (!friends.some((f: { id: string }) => f.id === body.userId)) return NextResponse.json({ error: 'Friend not found' }, { status: 404 })
      friendId = body.userId
    } else {
      const u = await ledger.addFriend(prisma, userId, { name: body.name })
      friendId = u.id
    }
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: friendId } },
      update: {},
      create: { groupId, userId: friendId },
    })
    await prisma.activity.create({ data: { groupId, userId, type: 'member_added', metadata: JSON.stringify({ addedUserId: friendId }) } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
