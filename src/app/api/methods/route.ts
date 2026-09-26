import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionUserId, unauthorized } from '@/lib/api'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

const KINDS = ['upi', 'card', 'cash', 'bank', 'other']

export async function GET() {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  return NextResponse.json({ methods: await ledger.listPaymentMethods(prisma, userId) })
}

// POST { name, kind } — add a payment method
export async function POST(request: NextRequest) {
  const userId = await sessionUserId()
  if (!userId) return unauthorized()
  const { name, kind } = await request.json().catch(() => ({}))
  const clean = String(name || '').trim().slice(0, 30)
  if (!clean) return NextResponse.json({ error: 'Give it a name' }, { status: 400 })
  const existing = await ledger.listPaymentMethods(prisma, userId, { includeArchived: true })
  const dupe = existing.find((m: { name: string }) => m.name.toLowerCase() === clean.toLowerCase())
  if (dupe) {
    const m = await prisma.paymentMethod.update({ where: { id: dupe.id }, data: { archivedAt: null } })
    return NextResponse.json({ method: m })
  }
  const m = await prisma.paymentMethod.create({
    data: { userId, name: clean, kind: KINDS.includes(kind) ? kind : 'other', sortOrder: existing.length },
  })
  return NextResponse.json({ method: m })
}
