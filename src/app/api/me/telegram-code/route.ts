import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

const BOT = process.env.TELEGRAM_BOT_USERNAME || 'fairshare1_bot'

// POST -> one-time deep link: https://t.me/<bot>?start=<code>
export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const code = crypto.randomBytes(12).toString('hex')
  await prisma.user.update({
    where: { id: session.userId },
    data: { linkCode: code, linkCodeExpires: new Date(Date.now() + 15 * 60 * 1000) },
  })
  return NextResponse.json({ url: `https://t.me/${BOT}?start=${code}` })
}
