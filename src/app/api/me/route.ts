import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const data: { upiId?: string | null; defaultGroupId?: string | null; displayName?: string } = {}

  if ('upiId' in body) {
    const v = String(body.upiId || '').trim()
    if (v && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v)) return NextResponse.json({ error: 'That doesn’t look like a UPI ID (name@bank)' }, { status: 400 })
    data.upiId = v || null
  }
  if ('defaultGroupId' in body) {
    const id = body.defaultGroupId || null
    if (id) {
      const g = await prisma.group.findFirst({ where: { id, deletedAt: null, isPersonal: false, members: { some: { userId: session.userId } } } })
      if (!g) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    data.defaultGroupId = id
  }
  if (typeof body.displayName === 'string' && body.displayName.trim()) data.displayName = body.displayName.trim().slice(0, 40)

  await prisma.user.update({ where: { id: session.userId }, data })
  return NextResponse.json({ ok: true })
}
