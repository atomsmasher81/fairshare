import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fail, sessionUserId, unauthorized } from '@/lib/api'
import { draftFromText, loadContext } from '@/lib/entry'

export const dynamic = 'force-dynamic'

// POST { text } → { draft } — preview only, nothing is saved
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  try {
    const { text } = await request.json()
    const recent = await prisma.aiCall.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3600e3) } } })
    if (recent > 120) return NextResponse.json({ error: 'Slow down a little — try again in a few minutes' }, { status: 429 })
    const ctx = await loadContext(userId)
    const { draft, error } = await draftFromText(String(text || ''), ctx)
    if (!draft) return NextResponse.json({ error }, { status: 422 })
    return NextResponse.json({ draft })
  } catch (e) {
    return fail(e)
  }
}
