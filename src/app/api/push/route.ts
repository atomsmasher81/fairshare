import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'

// POST { endpoint, keys: { p256dh, auth } } — save this device's subscription
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const sub = await request.json().catch(() => null)
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!/^https:\/\//.test(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth, userAgent: request.headers.get('user-agent')?.slice(0, 200) },
  })
  return NextResponse.json({ ok: true })
}

// DELETE { endpoint } — this device turned notifications off
export async function DELETE(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { endpoint } = await request.json().catch(() => ({}))
  if (typeof endpoint === 'string') await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } })
  return NextResponse.json({ ok: true })
}
