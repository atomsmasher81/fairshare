import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hashPassword } from '@/lib/auth'
import { rateLimited } from '@/lib/rate-limit'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

/**
 * POST { username, password, displayName }  → turn the placeholder into a real account
 * POST { mergeIntoMe: true } (signed in)      → move the placeholder's history onto your account
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (rateLimited(`claim:${ip}`, 10, 60 * 60e3)) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })

  const placeholder = await prisma.user.findUnique({ where: { claimCode: code } })
  if (!placeholder || !placeholder.isPlaceholder) return NextResponse.json({ error: 'This link has already been used' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const session = await getSession()

  if (body.mergeIntoMe) {
    if (!session.isLoggedIn || !session.userId) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
    if (session.userId === placeholder.addedById) return NextResponse.json({ error: 'You created this friend — send the link to them instead' }, { status: 400 })
    await ledger.mergeUsers(prisma, placeholder.id, session.userId)
    return NextResponse.json({ ok: true })
  }

  const username = String(body.username || '').trim().toLowerCase().replace(/^@/, '')
  const password = String(body.password || '')
  const displayName = String(body.displayName || placeholder.displayName).trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!/^[a-z0-9_.]{3,24}$/.test(username)) return NextResponse.json({ error: 'Username: 3–24 letters, numbers, dots or underscores' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  if (await prisma.user.findUnique({ where: { username } })) return NextResponse.json({ error: 'Username already taken' }, { status: 400 })

  const user = await prisma.user.update({
    where: { id: placeholder.id },
    data: { username, passwordHash: await hashPassword(password), displayName: displayName || placeholder.displayName, isPlaceholder: false, claimCode: null },
  })
  session.userId = user.id
  session.username = user.username
  session.isAdmin = user.isAdmin
  session.isLoggedIn = true
  await session.save()
  return NextResponse.json({ ok: true })
}
