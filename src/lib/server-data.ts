import { prisma } from '@/lib/prisma'
import type { LedgerOption } from '@/components/quick-add'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

export async function getLedgerOptions(userId: string): Promise<{ ledgers: LedgerOption[]; defaultId: string | null }> {
  const [groups, user] = await Promise.all([
    ledger.listSharedGroups(prisma, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { defaultGroupId: true } }),
  ])
  const ledgers: LedgerOption[] = [
    { id: null, name: 'Personal' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...groups.map((g: any) => ({ id: g.id, name: g.name, members: g.members.length })),
  ]
  const defaultId = user?.defaultGroupId && ledgers.some((l) => l.id === user.defaultGroupId) ? user.defaultGroupId : null
  return { ledgers, defaultId }
}

export async function getRecentDescriptions(userId: string, n = 8): Promise<string[]> {
  const rows = await prisma.expense.findMany({
    where: { createdById: userId, deletedAt: null, needsReview: false },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { description: true },
  })
  const seen = new Map<string, string>()
  for (const r of rows) {
    const k = r.description.toLowerCase()
    if (!seen.has(k)) seen.set(k, r.description)
    if (seen.size >= n) break
  }
  return Array.from(seen.values())
}

export function istMonthRange(offset = 0) {
  const IST = 5.5 * 3600e3
  const now = new Date(Date.now() + IST)
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1) - IST)
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1) - IST)
  return { from, to, label: new Date(from.getTime() + IST).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

export { ledger }
