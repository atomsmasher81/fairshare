/**
 * Expense history: readable snapshots and before → after diffs, stored on Activity rows so the
 * timeline can show exactly what changed ("Amount ₹1,200 → ₹1,500", "Split: equal → Rahul owes all").
 */
import { inr, NEED_META, categoryMeta, istDay, dayLabel, type Need } from '@/lib/format'

export interface Snapshot {
  description: string
  amount: number
  date: string // YYYY-MM-DD
  paidBy: string
  need: string | null
  method: string | null
  category: string
  ledger: string
  splits: { name: string; amount: number }[]
}

type ExpenseLike = {
  description: string
  amount: number
  date: Date
  category: string
  needLevel: string | null
  paidBy?: { displayName: string } | null
  paymentMethod?: { name: string } | null
  group?: { name: string; isPersonal?: boolean; isDirect?: boolean } | null
  splits?: { amount: number; user?: { displayName: string } | null }[]
}

export function snapshot(e: ExpenseLike): Snapshot {
  return {
    description: e.description,
    amount: e.amount,
    date: istDay(e.date),
    paidBy: e.paidBy?.displayName || '',
    need: e.needLevel,
    method: e.paymentMethod?.name || null,
    category: e.category,
    ledger: e.group?.isPersonal ? 'Personal' : e.group?.isDirect ? 'Non-group' : e.group?.name || '',
    splits: (e.splits || []).map((s) => ({ name: s.user?.displayName || '?', amount: s.amount })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export interface Change { field: string; from: string; to: string }

const needLabel = (n: string | null) => (n ? NEED_META[n as Need]?.label || n : 'No type')
const splitText = (s: Snapshot['splits']) => s.map((x) => `${x.name.split(' ')[0]} ${inr(x.amount)}`).join(', ') || '—'

export function diff(a: Snapshot, b: Snapshot): Change[] {
  const out: Change[] = []
  const add = (field: string, from: string, to: string) => { if (from !== to) out.push({ field, from, to }) }
  add('Description', a.description, b.description)
  add('Amount', inr(a.amount), inr(b.amount))
  add('Date', dayLabel(a.date), dayLabel(b.date))
  add('Paid by', a.paidBy, b.paidBy)
  add('Type', needLabel(a.need), needLabel(b.need))
  add('Paid with', a.method || 'Not set', b.method || 'Not set')
  add('Category', categoryMeta(a.category).label, categoryMeta(b.category).label)
  add('Where', a.ledger, b.ledger)
  add('Split', splitText(a.splits), splitText(b.splits))
  return out
}

/** Activity metadata, tolerant of the older formats written before history existed. */
export interface ActivityMeta {
  expenseId?: string
  settlementId?: string
  description?: string
  amount?: number
  changes?: Change[]
  before?: { amount?: number; description?: string }
  fromUserId?: string
  toUserId?: string
  groupName?: string
  addedUserId?: string
  removedUserId?: string
  removedDisplayName?: string
  source?: string
  via?: string
}

export function parseMeta(raw: string | null): ActivityMeta {
  if (!raw) return {}
  try { return JSON.parse(raw) as ActivityMeta } catch { return {} }
}
