import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'

type Ctx = { params: Promise<{ id: string }> }

// PATCH { name?, archived?, move?: -1 | 1 }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { id } = await params
  const m = await prisma.paymentMethod.findFirst({ where: { id, userId } })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))

  if (body.move === -1 || body.move === 1) {
    const all = await prisma.paymentMethod.findMany({ where: { userId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    const i = all.findIndex((x) => x.id === id)
    const j = i + body.move
    if (i >= 0 && j >= 0 && j < all.length) {
      ;[all[i], all[j]] = [all[j], all[i]]
      await prisma.$transaction(all.map((x, k) => prisma.paymentMethod.update({ where: { id: x.id }, data: { sortOrder: k } })))
    }
    return NextResponse.json({ ok: true })
  }

  const data: { name?: string; archivedAt?: Date | null } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 30)
  if (typeof body.archived === 'boolean') data.archivedAt = body.archived ? new Date() : null
  await prisma.paymentMethod.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
