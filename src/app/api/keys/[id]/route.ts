import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'

// DELETE — revoke a key immediately; anything using it stops working
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const r = await prisma.apiKey.deleteMany({ where: { id, userId } })
  if (!r.count) return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// PATCH { name } — rename
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const { name } = await request.json().catch(() => ({}))
  const clean = String(name || '').trim().slice(0, 40)
  if (!clean) return NextResponse.json({ error: 'Give it a name' }, { status: 400 })
  const r = await prisma.apiKey.updateMany({ where: { id, userId }, data: { name: clean } })
  if (!r.count) return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
