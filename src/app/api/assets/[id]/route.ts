import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
import { ASSET_KINDS } from '@/lib/wealth'

// PATCH { name?, kind?, note?, archived? } — archived accounts drop out of net worth but keep their history
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const a = await prisma.asset.findFirst({ where: { id, userId } })
  if (!a) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const data: { name?: string; kind?: string; note?: string | null; archivedAt?: Date | null } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 60)
  if (typeof body.kind === 'string' && body.kind in ASSET_KINDS) data.kind = body.kind
  if ('note' in body) data.note = String(body.note || '').trim().slice(0, 200) || null
  if (typeof body.archived === 'boolean') data.archivedAt = body.archived ? new Date() : null
  await prisma.asset.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
