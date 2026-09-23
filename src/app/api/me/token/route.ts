import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { newToken, hashToken } = require('@/lib/ledger')

// POST -> rotate personal API token. Shown once.
export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = newToken()
  await prisma.user.update({ where: { id: session.userId }, data: { apiTokenHash: hashToken(token) } })
  return NextResponse.json({ token })
}
