import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const { pushToUser } = require('@/lib/push')

// POST — send a test notification to all of your devices
export async function POST() {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const r = await pushToUser(prisma, userId, { title: 'Notifications are on 🎉', body: 'You’ll hear from FairShare when friends add expenses with you.', url: '/home', tag: 'test' })
  return NextResponse.json({ ok: true, sent: r.sent })
}
