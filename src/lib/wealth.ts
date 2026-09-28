/**
 * Net worth, kept deliberately simple: each account has dated snapshots of
 * { invested (principal), value (what it's worth now) }. The latest snapshot is the baseline,
 * and investment expenses linked to the account that were logged after it are added on top —
 * so deleting or editing such an expense fixes the account automatically. Loans subtract.
 */
import { prisma } from '@/lib/prisma'

export const ASSET_KINDS = {
  bank: { label: 'Bank / savings', emoji: '🏦' },
  mutual_fund: { label: 'Mutual fund', emoji: '📈' },
  stocks: { label: 'Stocks', emoji: '📊' },
  fd: { label: 'Fixed deposit', emoji: '🔒' },
  ppf: { label: 'PPF', emoji: '🏛️' },
  epf: { label: 'EPF', emoji: '🧾' },
  nps: { label: 'NPS', emoji: '👵' },
  gold: { label: 'Gold', emoji: '🪙' },
  crypto: { label: 'Crypto', emoji: '🪙' },
  real_estate: { label: 'Property', emoji: '🏠' },
  loan: { label: 'Loan / debt', emoji: '💳' },
  other: { label: 'Other', emoji: '💼' },
} as const
export type AssetKind = keyof typeof ASSET_KINDS
export const ASSET_KIND_KEYS = Object.keys(ASSET_KINDS) as AssetKind[]
/** Kinds where value is simply the balance — no separate “put in”. */
export const FLAT_KINDS = ['bank']
export const kindMeta = (k: string) => ASSET_KINDS[(k as AssetKind)] || ASSET_KINDS.other

type Snap = { id: string; date: Date; createdAt: Date; invested: number; value: number; note: string | null; source: string }
type Inv = { id: string; amount: number; date: Date; createdAt: Date; description: string }

/** Is this investment expense on top of (i.e. after) the snapshot? */
function after(e: Inv, s: Snap) {
  return e.date.getTime() > s.date.getTime() || (e.date.getTime() === s.date.getTime() && e.createdAt > s.createdAt)
}

/** Invested / value of one account as of time `t` (default: now). */
function position(snaps: Snap[], invs: Inv[], t = new Date()) {
  const base = snaps.filter((s) => s.date <= t).sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0]
  const extra = invs.filter((e) => e.date <= t && (!base || after(e, base))).reduce((a, e) => a + e.amount, 0)
  return {
    invested: (base?.invested || 0) + extra,
    value: (base?.value || 0) + extra,
    baseline: base || null,
    addedSince: extra,
  }
}

export interface AccountView {
  id: string
  name: string
  kind: AssetKind
  note: string | null
  archived: boolean
  invested: number
  value: number
  gain: number // value − invested (not meaningful for loans)
  gainPct: number | null
  updatedAt: string | null // date of the latest snapshot
  addedSince: number // investments logged since that snapshot
  isLoan: boolean
}

async function load(userId: string, includeArchived = false) {
  return prisma.asset.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      snapshots: { orderBy: { date: 'desc' }, select: { id: true, date: true, createdAt: true, invested: true, value: true, note: true, source: true } },
      expenses: { where: { deletedAt: null, needLevel: 'investment' }, select: { id: true, amount: true, date: true, createdAt: true, description: true } },
    },
  })
}

export async function netWorth(userId: string, opts: { includeArchived?: boolean } = {}) {
  const assets = await load(userId, opts.includeArchived)
  const accounts: AccountView[] = assets.map((a) => {
    const p = position(a.snapshots, a.expenses)
    const isLoan = a.kind === 'loan'
    return {
      id: a.id, name: a.name, kind: (a.kind as AssetKind) in ASSET_KINDS ? (a.kind as AssetKind) : 'other', note: a.note,
      archived: !!a.archivedAt, invested: p.invested, value: p.value,
      gain: isLoan ? 0 : p.value - p.invested,
      gainPct: !isLoan && p.invested > 0 ? ((p.value - p.invested) / p.invested) * 100 : null,
      updatedAt: p.baseline ? p.baseline.date.toISOString() : null, addedSince: p.addedSince, isLoan,
    }
  })
  const live = accounts.filter((a) => !a.archived)
  const assetsTotal = live.filter((a) => !a.isLoan).reduce((s, a) => s + a.value, 0)
  const loans = live.filter((a) => a.isLoan).reduce((s, a) => s + a.value, 0)
  const invested = live.filter((a) => !a.isLoan).reduce((s, a) => s + a.invested, 0)

  // Net worth at the start of this month (India time), for "change this month"
  const IST = 5.5 * 3600e3
  const now = new Date(Date.now() + IST)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - IST)
  let startOfMonth = 0
  let hadDataAtStart = false
  for (const a of assets.filter((x) => !x.archivedAt)) {
    const p = position(a.snapshots, a.expenses, monthStart)
    if (p.baseline || p.addedSince) hadDataAtStart = true
    startOfMonth += a.kind === 'loan' ? -p.value : p.value
  }
  const total = assetsTotal - loans
  const lastUpdate = live.map((a) => a.updatedAt).filter(Boolean).sort().pop() || null
  return {
    accounts,
    total,
    assets: assetsTotal,
    loans,
    invested,
    gain: assetsTotal - invested,
    gainPct: invested > 0 ? ((assetsTotal - invested) / invested) * 100 : null,
    changeThisMonth: hadDataAtStart ? total - startOfMonth : null,
    lastUpdate,
  }
}

/** Net worth at the end of each of the last `months` months (oldest first). */
export async function netWorthHistory(userId: string, months = 12) {
  const assets = await load(userId)
  const IST = 5.5 * 3600e3
  const now = new Date(Date.now() + IST)
  const out: { month: string; total: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) - IST - 1)
    const t = i === 0 ? new Date() : end
    let total = 0
    let any = false
    for (const a of assets) {
      const p = position(a.snapshots, a.expenses, t)
      if (p.baseline || p.addedSince) any = true
      total += a.kind === 'loan' ? -p.value : p.value
    }
    if (any) out.push({ month: new Date(end.getTime() + IST).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }), total })
  }
  return out
}

export async function accountDetail(userId: string, id: string) {
  const a = await prisma.asset.findFirst({
    where: { id, userId },
    include: {
      snapshots: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
      expenses: { where: { deletedAt: null, needLevel: 'investment' }, orderBy: { date: 'desc' }, select: { id: true, amount: true, date: true, createdAt: true, description: true } },
    },
  })
  if (!a) return null
  const p = position(a.snapshots, a.expenses)
  return { asset: a, position: p }
}

export interface SnapshotRow { assetId?: string; name?: string; kind?: string; invested?: number; value?: number; note?: string | null }

/**
 * Record new values (one snapshot per account) as of `date`. Rows can name accounts that don't exist
 * yet — they're created. Omitted invested/value keep the account's current number.
 * Returns before → after for each row.
 */
export async function recordValues(userId: string, date: Date, rows: SnapshotRow[], source = 'manual') {
  const existing = await load(userId, true)
  const results: { id: string; name: string; created: boolean; before: { invested: number; value: number }; after: { invested: number; value: number } }[] = []
  for (const row of rows) {
    let a = row.assetId ? existing.find((x) => x.id === row.assetId) : undefined
    if (!a && row.name) {
      const q = row.name.trim().toLowerCase()
      a = existing.find((x) => x.name.toLowerCase() === q) || existing.find((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()))
    }
    let created = false
    if (!a) {
      if (!row.name?.trim()) throw Object.assign(new Error('Account not found'), { publicMessage: 'Account not found', status: 404 })
      const kind = row.kind && row.kind in ASSET_KINDS ? row.kind : 'other'
      const n = await prisma.asset.create({ data: { userId, name: row.name.trim().slice(0, 60), kind, sortOrder: existing.length } })
      a = { ...n, snapshots: [], expenses: [] }
      existing.push(a)
      created = true
    } else if (a.archivedAt) {
      await prisma.asset.update({ where: { id: a.id }, data: { archivedAt: null } })
    }
    const before = position(a.snapshots, a.expenses)
    // A bank balance has no "returns": what's there is what you put in. A brand-new account given only
    // a value is treated the same way, so returns start at zero instead of counting the whole balance.
    const fresh = !a.snapshots.length && !a.expenses.length
    const flat = a.kind === 'bank' || (fresh && row.invested === undefined)
    const value = row.value !== undefined ? Math.round(row.value) : row.invested !== undefined && fresh ? Math.round(row.invested) : before.value
    const invested = row.invested !== undefined ? Math.round(row.invested) : flat && row.value !== undefined ? value : before.invested
    if (invested < 0 || value < 0) throw Object.assign(new Error('Amounts can’t be negative'), { publicMessage: 'Amounts can’t be negative', status: 400 })
    const snap = await prisma.assetSnapshot.create({ data: { assetId: a.id, date, invested, value, note: row.note || null, source } })
    a.snapshots.unshift({ id: snap.id, date: snap.date, createdAt: snap.createdAt, invested, value, note: snap.note, source })
    results.push({ id: a.id, name: a.name, created, before: { invested: before.invested, value: before.value }, after: { invested, value } })
  }
  return results
}

export async function listAccountsBrief(userId: string) {
  return prisma.asset.findMany({ where: { userId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, kind: true } })
}
