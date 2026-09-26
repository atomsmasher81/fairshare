import 'server-only'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

export { ledger }

export async function requireUserId() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/')
  return session.userId
}

const IST = 5.5 * 3600e3

/** Calendar month in India time. offset 0 = this month, -1 = last month… */
export function monthRange(offset = 0) {
  const now = new Date(Date.now() + IST)
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1) - IST)
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1) - IST)
  const mid = new Date(from.getTime() + IST + 86400e3)
  return {
    from, to, offset,
    label: mid.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }),
    longLabel: mid.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    daysInMonth: new Date(Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth() + 1, 0)).getUTCDate(),
    dayOfMonth: offset === 0 ? now.getUTCDate() : null,
  }
}

export interface Entry {
  id: string
  kind: 'expense' | 'payment'
  description: string
  date: string
  createdAt: string
  amount: number // full amount
  share: number // what it cost me (my split); for payments 0
  impact: number // effect on balances: + I lent / got owed, − I borrowed; payments: + I paid them back
  iPaid: boolean
  paidByName: string
  ledger: { id: string; kind: 'personal' | 'direct' | 'group'; name: string }
  people: string[] // other people involved
  needLevel: string | null
  category: string
  method: string | null
  needsReview: boolean
  source: string
  edited: boolean
  deleted: { by: string; at: string } | null // shown in lists, never counted in totals
}

/** Every expense and payment you're part of in [from, to). */
export async function entriesFor(userId: string, from?: Date, to?: Date, opts: { groupId?: string; friendId?: string; take?: number; everyone?: boolean; includeDeleted?: boolean } = {}): Promise<Entry[]> {
  const dateFilter = from && to ? { date: { gte: from, lt: to } } : {}
  const groupFilter = opts.groupId ? { groupId: opts.groupId } : {}
  const involvesFriend = opts.friendId
    ? { OR: [{ paidById: opts.friendId }, { splits: { some: { userId: opts.friendId } } }] }
    : {}
  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: {
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
        group: { deletedAt: null },
        ...dateFilter,
        ...groupFilter,
        AND: [
          opts.everyone ? {} : { OR: [{ paidById: userId }, { splits: { some: { userId } } }] },
          involvesFriend,
        ],
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: opts.take,
      select: {
        id: true, description: true, amount: true, date: true, createdAt: true, category: true, needLevel: true,
        needsReview: true, source: true, paidById: true, editedAt: true, deletedAt: true, deletedById: true,
        paidBy: { select: { displayName: true } },
        paymentMethod: { select: { name: true } },
        group: { select: { id: true, name: true, isPersonal: true, isDirect: true } },
        splits: { select: { userId: true, amount: true, user: { select: { displayName: true } } } },
      },
    }),
    prisma.settlement.findMany({
          where: {
            ...(opts.includeDeleted ? {} : { deletedAt: null }),
            group: { deletedAt: null },
            ...(from && to ? { date: { gte: from, lt: to } } : {}),
            ...groupFilter,
            ...(opts.everyone ? {} : {
              OR: opts.friendId
                ? [{ fromUserId: userId, toUserId: opts.friendId }, { fromUserId: opts.friendId, toUserId: userId }]
                : [{ fromUserId: userId }, { toUserId: userId }],
            }),
          },
          orderBy: { date: 'desc' },
          take: opts.take,
          select: {
            id: true, amount: true, date: true, createdAt: true, fromUserId: true, toUserId: true, deletedAt: true, deletedById: true,
            fromUser: { select: { displayName: true } }, toUser: { select: { displayName: true } },
            group: { select: { id: true, name: true, isDirect: true } },
          },
        }),
  ])

  const out: Entry[] = expenses.map((e) => {
    const mine = e.splits.find((s) => s.userId === userId)?.amount || 0
    const iPaid = e.paidById === userId
    const kind = e.group.isPersonal ? 'personal' : e.group.isDirect ? 'direct' : 'group'
    const others = e.splits.filter((s) => s.userId !== userId).map((s) => s.user.displayName)
    if (!iPaid && !others.includes(e.paidBy.displayName)) others.unshift(e.paidBy.displayName)
    return {
      id: e.id,
      kind: 'expense',
      description: e.description,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      amount: e.amount,
      share: mine,
      impact: kind === 'personal' ? 0 : iPaid ? e.amount - mine : -mine,
      iPaid,
      paidByName: iPaid ? 'You' : e.paidBy.displayName,
      ledger: { id: e.group.id, kind, name: kind === 'personal' ? 'Personal' : e.group.name },
      people: kind === 'personal' ? [] : others,
      needLevel: e.needLevel,
      category: e.category,
      method: iPaid ? e.paymentMethod?.name || null : null,
      needsReview: e.needsReview,
      source: e.source,
      edited: !!e.editedAt,
      deleted: e.deletedAt ? { by: e.deletedById || '', at: e.deletedAt.toISOString() } : null,
    }
  })
  for (const s of settlements) {
    const iPaid = s.fromUserId === userId
    const involved = iPaid || s.toUserId === userId
    const other = iPaid ? s.toUser.displayName : s.fromUser.displayName
    out.push({
      id: s.id,
      kind: 'payment',
      description: !involved ? `${s.fromUser.displayName} paid ${s.toUser.displayName}` : iPaid ? `You paid ${other}` : `${other} paid you`,
      date: s.date.toISOString(),
      createdAt: s.createdAt.toISOString(),
      amount: s.amount,
      share: 0,
      impact: !involved ? 0 : iPaid ? s.amount : -s.amount,
      iPaid,
      paidByName: iPaid ? 'You' : s.fromUser.displayName,
      ledger: { id: s.group.id, kind: s.group.isDirect ? 'direct' : 'group', name: s.group.name },
      people: [other],
      needLevel: null,
      category: 'payment',
      method: null,
      needsReview: false,
      source: 'web',
      edited: false,
      deleted: s.deletedAt ? { by: s.deletedById || '', at: s.deletedAt.toISOString() } : null,
    })
  }
  const deleterIds = Array.from(new Set(out.map((e) => e.deleted?.by).filter((x): x is string => !!x && x !== userId)))
  if (deleterIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: deleterIds } }, select: { id: true, displayName: true } })
    const names = new Map(users.map((u) => [u.id, u.displayName.split(' ')[0]]))
    for (const e of out) if (e.deleted) e.deleted.by = e.deleted.by === userId ? 'You' : names.get(e.deleted.by) || ''
  } else {
    for (const e of out) if (e.deleted) e.deleted.by = e.deleted.by === userId ? 'You' : ''
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
  return opts.take ? out.slice(0, opts.take) : out
}

export interface MonthSummary {
  spent: number // your share of everything, i.e. what the month actually cost you
  count: number
  byNeed: Record<'essential' | 'semi' | 'luxury' | 'unset', number>
  byCategory: [string, number][]
  byMethod: [string, number][] // money that left each account (full amounts you paid)
  top: Entry[]
  dailyAvg: number
}

export function summarize(entries: Entry[], daysElapsed: number): MonthSummary {
  const byNeed = { essential: 0, semi: 0, luxury: 0, unset: 0 }
  const cat = new Map<string, number>()
  const method = new Map<string, number>()
  let spent = 0
  let count = 0
  for (const e of entries) {
    if (e.kind !== 'expense' || e.deleted) continue
    if (e.iPaid) method.set(e.method || 'Not set', (method.get(e.method || 'Not set') || 0) + e.amount)
    if (!e.share) continue
    count++
    spent += e.share
    const k = (e.needLevel || 'unset') as keyof typeof byNeed
    byNeed[k in byNeed ? k : 'unset'] += e.share
    cat.set(e.category, (cat.get(e.category) || 0) + e.share)
  }
  const sortDesc = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  const top = entries.filter((e) => e.kind === 'expense' && !e.deleted && e.share > 0).sort((a, b) => b.share - a.share).slice(0, 5)
  return {
    spent, count, byNeed, byCategory: sortDesc(cat), byMethod: sortDesc(method), top,
    dailyAvg: daysElapsed > 0 ? Math.round(spent / daysElapsed) : 0,
  }
}

export interface FriendBalance {
  user: { id: string; displayName: string; upiId: string | null; isPlaceholder: boolean; username: string }
  net: number
  groups: { id: string; name: string; net: number; isDirect: boolean }[]
}

export async function balances(userId: string) {
  const [friends, all] = await Promise.all([
    ledger.friendBalances(prisma, userId) as Promise<FriendBalance[]>,
    ledger.listFriends(prisma, userId) as Promise<FriendBalance['user'][]>,
  ])
  // friendBalances only knows people with a ledger; listFriends is the same set, but keep both in sync defensively
  const known = new Set(friends.map((f) => f.user.id))
  for (const u of all) if (!known.has(u.id)) friends.push({ user: u, net: 0, groups: [] })
  const owed = friends.filter((f) => f.net > 0).reduce((a, f) => a + f.net, 0)
  const owe = friends.filter((f) => f.net < 0).reduce((a, f) => a - f.net, 0)
  return { friends, owed, owe }
}

export async function groupsWithBalance(userId: string) {
  const groups = await prisma.group.findMany({
    where: { deletedAt: null, isPersonal: false, isDirect: false, members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true,
      members: { select: { user: { select: { id: true, displayName: true } } } },
      expenses: { where: { deletedAt: null }, select: { paidById: true, amount: true, date: true, splits: { select: { userId: true, amount: true } } } },
      settlements: { where: { deletedAt: null }, select: { fromUserId: true, toUserId: true, amount: true, date: true } },
    },
  })
  return groups.map((g) => {
    let net = 0
    let last = 0
    for (const e of g.expenses) {
      if (e.paidById === userId) net += e.amount
      for (const s of e.splits) if (s.userId === userId) net -= s.amount
      last = Math.max(last, e.date.getTime())
    }
    for (const s of g.settlements) {
      if (s.fromUserId === userId) net += s.amount
      if (s.toUserId === userId) net -= s.amount
      last = Math.max(last, s.date.getTime())
    }
    return { id: g.id, name: g.name, members: g.members.map((m) => m.user), net, lastActivity: last }
  }).sort((a, b) => b.lastActivity - a.lastActivity)
}

/** Net balance per member of a group, and the fewest payments that settle it. */
export async function groupLedger(groupId: string) {
  const g = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      members: { orderBy: { joinedAt: 'asc' }, select: { user: { select: { id: true, displayName: true, upiId: true, isPlaceholder: true } } } },
      expenses: { where: { deletedAt: null }, select: { paidById: true, amount: true, splits: { select: { userId: true, amount: true } } } },
      settlements: { where: { deletedAt: null }, select: { fromUserId: true, toUserId: true, amount: true } },
    },
  })
  if (!g) return null
  const net = new Map<string, number>()
  for (const m of g.members) net.set(m.user.id, 0)
  const bump = (id: string, v: number) => net.set(id, (net.get(id) || 0) + v)
  let total = 0
  for (const e of g.expenses) {
    total += e.amount
    bump(e.paidById, e.amount)
    for (const s of e.splits) bump(s.userId, -s.amount)
  }
  for (const s of g.settlements) {
    bump(s.fromUserId, s.amount)
    bump(s.toUserId, -s.amount)
  }
  return { members: g.members.map((m) => m.user), net, total, transfers: simplify(net) }
}

/** Greedy: biggest debtor pays biggest creditor. Integer paise, stable order. */
export function simplify(net: Map<string, number>) {
  const debtors = Array.from(net.entries()).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v || a.id.localeCompare(b.id))
  const creditors = Array.from(net.entries()).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v || a.id.localeCompare(b.id))
  const out: { from: string; to: string; amount: number }[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v)
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay })
    debtors[i].v -= pay
    creditors[j].v -= pay
    if (!debtors[i].v) i++
    if (!creditors[j].v) j++
  }
  return out
}

export async function pendingReview(userId: string) {
  return prisma.expense.findMany({
    where: { createdById: userId, needsReview: true, deletedAt: null },
    orderBy: { date: 'desc' },
    take: 20,
    select: { id: true, description: true, amount: true, date: true, payee: true },
  })
}

export async function editorOptions(userId: string) {
  const [methods, friends, groups, me, recent, lastMethod] = await Promise.all([
    ledger.listPaymentMethods(prisma, userId) as Promise<{ id: string; name: string; kind: string }[]>,
    ledger.listFriends(prisma, userId) as Promise<{ id: string; displayName: string }[]>,
    ledger.listSharedGroups(prisma, userId) as Promise<{ id: string; name: string; members: { user: { id: string; displayName: string } }[] }[]>,
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } }),
    prisma.expense.findMany({
      where: { createdById: userId, deletedAt: null, needsReview: false },
      orderBy: { createdAt: 'desc' }, take: 200,
      select: { description: true, needLevel: true, paymentMethodId: true, category: true },
    }),
    ledger.lastUsedMethodId(prisma, userId) as Promise<string | null>,
  ])
  // Most used descriptions first (ties → most recent), with what you picked last time.
  const memory = new Map<string, { description: string; needLevel: string | null; methodId: string | null; category: string; n: number }>()
  for (const r of recent) {
    const k = r.description.toLowerCase()
    const m = memory.get(k)
    if (m) m.n++
    else memory.set(k, { description: r.description, needLevel: r.needLevel, methodId: r.paymentMethodId, category: r.category, n: 1 })
  }
  const suggestions = Array.from(memory.values()).sort((a, b) => b.n - a.n).slice(0, 40)
  return {
    me: { id: me!.id, name: me!.displayName },
    methods: methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
    friends: friends.map((f) => ({ id: f.id, name: f.displayName })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, members: g.members.map((m) => ({ id: m.user.id, name: m.user.displayName })) })),
    suggestions,
    lastMethodId: lastMethod || methods[0]?.id || null,
  }
}
export type EditorOptions = Awaited<ReturnType<typeof editorOptions>>

/* ------------------------------------------------------------------ */
/* Timeline: every add / edit / delete / restore / payment you can see */
/* ------------------------------------------------------------------ */

export interface TimelineItem {
  id: string
  type: string
  at: string
  actor: string // "You" or first name
  verb: string // "added", "edited", "deleted"…
  subject: string // "Milk", "Rahul paid you"
  amount: number | null
  where: string // "Personal", "Flat 402", "with Rahul"
  changes: { field: string; from: string; to: string }[]
  target: { kind: 'expense' | 'payment'; id: string; deleted: boolean; exists: boolean } | null
}

export async function timeline(userId: string, opts: { before?: Date; take?: number; expenseId?: string; settlementId?: string } = {}) {
  const { parseMeta } = await import('@/lib/history')
  const take = opts.take || 60
  const rows = await prisma.activity.findMany({
    where: {
      group: { deletedAt: null, members: { some: { userId } } },
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
      ...(opts.expenseId ? { metadata: { contains: opts.expenseId } } : {}),
      ...(opts.settlementId ? { metadata: { contains: opts.settlementId } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true, type: true, createdAt: true, userId: true, metadata: true,
      user: { select: { displayName: true } },
      group: { select: { name: true, isPersonal: true, isDirect: true, members: { select: { user: { select: { id: true, displayName: true } } } } } },
    },
  })
  const metas = rows.map((r) => parseMeta(r.metadata))
  const expenseIds = Array.from(new Set(metas.map((m) => m.expenseId).filter((x): x is string => !!x)))
  const settlementIds = Array.from(new Set(metas.map((m) => m.settlementId).filter((x): x is string => !!x)))
  const userIds = Array.from(new Set(metas.flatMap((m) => [m.fromUserId, m.toUserId, m.addedUserId]).filter((x): x is string => !!x)))
  const [exps, sets, users] = await Promise.all([
    prisma.expense.findMany({ where: { id: { in: expenseIds } }, select: { id: true, deletedAt: true, description: true, amount: true } }),
    prisma.settlement.findMany({ where: { id: { in: settlementIds } }, select: { id: true, deletedAt: true, fromUserId: true, toUserId: true, amount: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
  ])
  const expMap = new Map(exps.map((e) => [e.id, e]))
  const setMap = new Map(sets.map((s) => [s.id, s]))
  const name = (id?: string) => (!id ? 'Someone' : id === userId ? 'You' : users.find((u) => u.id === id)?.displayName.split(' ')[0] || 'Someone')
  const obj = (id?: string) => (id === userId ? 'you' : name(id))

  const items: TimelineItem[] = rows.map((r, i) => {
    const m = metas[i]
    const g = r.group
    const where = g.isPersonal ? 'Personal'
      : g.isDirect ? `with ${g.members.filter((x) => x.user.id !== userId).map((x) => x.user.displayName.split(' ')[0]).join(', ')}`
      : g.name
    const actor = r.userId === userId ? 'You' : r.user.displayName.split(' ')[0]
    const base = { id: r.id, type: r.type, at: r.createdAt.toISOString(), actor, where, changes: [] as TimelineItem['changes'], target: null as TimelineItem['target'] }
    const exp = m.expenseId ? expMap.get(m.expenseId) : undefined
    const set = m.settlementId ? setMap.get(m.settlementId) : undefined
    const expTarget = m.expenseId ? { kind: 'expense' as const, id: m.expenseId, deleted: !!exp?.deletedAt, exists: !!exp } : null
    const setTarget = m.settlementId ? { kind: 'payment' as const, id: m.settlementId, deleted: !!set?.deletedAt, exists: !!set } : null
    const desc = m.description || exp?.description || 'an expense'
    const amt = m.amount ?? exp?.amount ?? null
    const payment = () => {
      const from = m.fromUserId || set?.fromUserId
      const to = m.toUserId || set?.toUserId
      return `${obj(from)} paid ${obj(to)}`
    }
    switch (r.type) {
      case 'expense_added': return { ...base, verb: 'added', subject: desc, amount: amt, target: expTarget }
      case 'expense_edited': {
        const changes = m.changes || (m.before ? [
          ...(m.before.description && m.before.description !== m.description ? [{ field: 'Description', from: m.before.description, to: m.description || '' }] : []),
          ...(m.before.amount != null && m.before.amount !== m.amount ? [{ field: 'Amount', from: inrPlain(m.before.amount), to: inrPlain(m.amount || 0) }] : []),
        ] : [])
        return { ...base, verb: 'edited', subject: desc, amount: amt, changes, target: expTarget }
      }
      case 'expense_deleted': return { ...base, verb: 'deleted', subject: desc, amount: amt, target: expTarget }
      case 'expense_restored': return { ...base, verb: 'restored', subject: desc, amount: amt, target: expTarget }
      case 'settlement': return { ...base, verb: 'recorded a payment —', subject: payment(), amount: m.amount ?? set?.amount ?? null, target: setTarget }
      case 'settlement_deleted': return { ...base, verb: 'deleted a payment —', subject: payment(), amount: m.amount ?? null, target: setTarget }
      case 'settlement_restored': return { ...base, verb: 'restored a payment —', subject: payment(), amount: m.amount ?? null, target: setTarget }
      case 'group_created': return { ...base, verb: 'created the group', subject: g.name, amount: null }
      case 'member_joined': return { ...base, verb: 'joined', subject: g.name, amount: null }
      case 'member_left': return { ...base, verb: 'left', subject: g.name, amount: null }
      case 'member_added': return { ...base, verb: 'added', subject: `${name(m.addedUserId)} to ${g.name}`, amount: null }
      case 'member_removed': return { ...base, verb: 'removed', subject: `${m.removedDisplayName || 'someone'} from ${g.name}`, amount: null }
      default: return { ...base, verb: r.type.replace(/_/g, ' '), subject: desc, amount: amt }
    }
  })
  return { items, nextBefore: rows.length === take ? rows[rows.length - 1].createdAt.toISOString() : null }
}

function inrPlain(paise: number) {
  const n = paise / 100
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}
