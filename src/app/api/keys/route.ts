import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const { newToken, hashToken } = require('@/lib/ledger')

export async function GET() {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const keys = await prisma.apiKey.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  })
  return NextResponse.json({ keys })
}

// POST { name } → { key, token } — the token is returned this once and never again
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { name } = await request.json().catch(() => ({}))
  const clean = String(name || '').trim().slice(0, 40) || 'Personal key'
  if ((await prisma.apiKey.count({ where: { userId } })) >= 20) {
    return NextResponse.json({ error: 'You have 20 keys — delete one you no longer use first' }, { status: 400 })
  }
  const token: string = newToken()
  const key = await prisma.apiKey.create({
    data: { userId, name: clean, hash: hashToken(token), prefix: token.slice(0, 7) },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  })
  return NextResponse.json({ key, token })
}
