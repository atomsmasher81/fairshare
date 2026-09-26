import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

// POST { username } or { name } — add a friend (placeholder when they're not on FairShare yet)
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const body = await request.json()
    const u = await ledger.addFriend(prisma, userId, { username: body.username, name: body.name })
    return NextResponse.json({ ok: true, friend: { id: u.id, name: u.displayName, isPlaceholder: u.isPlaceholder } })
  } catch (e) {
    return fail(e)
  }
}
