import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'

// DELETE — remove a mistaken value update; the account falls back to the previous one
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const r = await prisma.assetSnapshot.deleteMany({ where: { id, asset: { userId } } })
  if (!r.count) return NextResponse.json({ error: 'Update not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
