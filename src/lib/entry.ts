/**
 * Free text ("milk 20", "dinner 1200 with rahul and amit on card") → a Draft that the
 * app can preview and the Siri endpoint can save. Simple entries never touch the LLM.
 */
import { prisma } from '@/lib/prisma'
import { aiEnabled, parseWithAI, type ParsedEntry } from '@/lib/ai'
import { parseRules } from '@/lib/rules'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { parseQuickText, guessCategory } = require('@/lib/parse')

export type NeedLevel = 'essential' | 'semi' | 'luxury'

export interface Draft {
  kind: 'expense' | 'settlement'
  amount: number // paise
  description: string
  needLevel: NeedLevel | null
  category: string
  paymentMethodId: string | null
  date: string // ISO
  // where it goes
  groupId: string | null // null = personal (or direct ledger when friendIds set)
  groupName: string | null
  friendIds: string[] // for non-group shared expenses
  paidById: string
  splitMode: 'equal' | 'full' | 'exact'
  splits: { userId: string; amount: number }[] | null // for full/exact
  // settlement
  toUserId: string | null
  // display
  people: { id: string; name: string }[]
  notes: string[] // things the user should double check
  via: 'quick' | 'ai'
  needsReview: boolean
  targetSaid?: 'personal' | 'shared' | null
}

export interface EntryContext {
  userId: string
  meName: string
  methods: { id: string; name: string }[]
  friends: { id: string; displayName: string }[]
  groups: { id: string; name: string; members: { user: { id: string; displayName: string } }[] }[]
}

export async function loadContext(userId: string): Promise<EntryContext> {
  const [me, methods, friends, groups] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    ledger.listPaymentMethods(prisma, userId),
    ledger.listFriends(prisma, userId),
    ledger.listSharedGroups(prisma, userId),
  ])
  return { userId, meName: me?.displayName || 'You', methods, friends, groups }
}

const IST = 5.5 * 3600e3
export function todayIST() {
  return new Date(Date.now() + IST).toISOString().slice(0, 10)
}
/** Noon IST on the given day, so the date never shifts across timezones. */
function dateFromDay(day: string) {
  return new Date(`${day}T12:00:00+05:30`)
}

// A sensible first guess when we've never seen this item; your own past choice always wins.
const NEED_BY_CATEGORY: Record<string, NeedLevel> = {
  groceries: 'essential', rent: 'essential', utilities: 'essential', health: 'essential',
  food: 'semi', travel: 'semi',
  shopping: 'luxury', entertainment: 'luxury',
}

// Words that mean the sentence carries more than "thing amount"
const COMPLEX = /\b(with|and|paid|pay|owe|owes|owed|split|share|shared|for|yesterday|today|tomorrow|last|on|via|by|using|card|cash|upi|gpay|phonepe|paytm|back|returned|gave|lent|borrowed|each|half|k|hundred|thousand|lakh|mein|ko|ne|diya|liya|kal|parso)\b/i

// Words that say where money goes or how the sentence is built — a job for the AI, not the fast path
const ROUTING = /\b(add|added|to|in|into|at|from|personal|personally|expense|expenses|group|myself|me|my|rupees|rupee|rs|bucks|spent|spend|split|flat)\b/i

function looksSimple(text: string, ctx: EntryContext) {
  const t = text.trim()
  if (t.length > 40 || COMPLEX.test(t) || ROUTING.test(t)) return false
  if (t.replace(/[\d,.₹]+/g, ' ').trim().split(/\s+/).filter(Boolean).length > 3) return false
  const lower = ` ${t.toLowerCase()} `
  const mentions = [...ctx.friends.map((f) => f.displayName), ...ctx.groups.map((g) => g.name), ...ctx.methods.map((m) => m.name)]
  if (mentions.some((n) => n && lower.includes(` ${n.toLowerCase().split(' ')[0]} `))) return false
  const numbers = t.match(/\d[\d,]*(\.\d+)?/g) || []
  return numbers.length === 1
}

function titleCase(s: string) {
  return s.replace(/\s+/g, ' ').trim().replace(/(^|\s)(\p{Ll})/gu, (_m, sp, c) => sp + c.toUpperCase())
}

const PERSONAL = /(\b(personal|personally|myself|just me|only me|for me|my own|khud|apna)\b|(^|\s)#me\b)/i

/**
 * Parse free text into a draft. `targetSaid` records whether the sentence itself chose where the
 * money goes ("personal", "with Rahul", "in flat") so callers never override an explicit wish.
 */
export async function draftFromText(text: string, ctx: EntryContext): Promise<{ draft: Draft | null; error?: string; model?: string }> {
  const r = await draftFromTextInner(text, ctx)
  const d = r.draft
  if (!d) return r
  if (d.kind === 'expense' && PERSONAL.test(text)) {
    d.groupId = null; d.groupName = null; d.friendIds = []; d.people = []
    d.splitMode = 'equal'; d.splits = null; d.paidById = ctx.userId
    d.targetSaid = 'personal'
  } else if (d.groupId || d.friendIds.length) {
    d.targetSaid = 'shared'
  }
  return r
}

async function draftFromTextInner(text: string, ctx: EntryContext): Promise<{ draft: Draft | null; error?: string; model?: string }> {
  const raw = String(text || '').trim()
  if (!raw) return { draft: null, error: 'Say something like “milk 20”' }

  if (looksSimple(raw, ctx)) return { draft: await quickDraft(raw, ctx) }

  const pctx = {
    today: todayIST(),
    methods: ctx.methods.map((m) => m.name),
    friends: ctx.friends.map((f) => f.displayName),
    groups: ctx.groups.map((g) => g.name),
  }
  const methodKinds = Object.fromEntries(ctx.methods.map((m) => [m.name, (m as { kind?: string }).kind || 'other']))

  let parsed: ParsedEntry | null = null
  let model = 'rules'
  if (aiEnabled()) {
    const started = Date.now()
    try {
      const r = await parseWithAI(raw, pctx)
      parsed = r.entry
      model = r.model
      await prisma.aiCall.create({ data: { userId: ctx.userId, input: raw.slice(0, 500), output: JSON.stringify(parsed), model, ms: Date.now() - started, ok: true } })
    } catch (e) {
      await prisma.aiCall.create({ data: { userId: ctx.userId, input: raw.slice(0, 500), output: String(e instanceof Error ? e.message : e).slice(0, 500), model: 'none', ms: Date.now() - started, ok: false } }).catch(() => {})
    }
  }
  // No AI (or it failed): the rule parser knows the common sentence shapes.
  if (!parsed) parsed = parseRules(raw, { ...pctx, methodKinds })
  if (!parsed) {
    // Never lose an entry: keep it personal and flag it for a look.
    const d = await quickDraft(raw, ctx)
    if (!d) return { draft: null, error: 'Couldn’t understand that. Try “milk 20” or “dinner 1200 with Rahul”.' }
    d.notes.push('Couldn’t work out who this was with — saved as personal')
    d.needsReview = true
    return { draft: d }
  }

  if (parsed.intent === 'none' || !parsed.amount) {
    return { draft: null, error: parsed.amount ? 'That doesn’t sound like an expense.' : 'How much was it? Try adding the amount.', model }
  }
  const amount = Math.round(parsed.amount * 100)
  const byName = (n: string) => ctx.friends.find((f) => f.displayName === n)
  const method = parsed.method ? ctx.methods.find((m) => m.name === parsed.method) : null
  const group = parsed.group ? ctx.groups.find((g) => g.name === parsed.group) : null

  if (parsed.intent === 'settlement') {
    const payerFriend = parsed.paid_by !== 'me' ? byName(parsed.paid_by) : null
    const other = payerFriend || (parsed.people[0] ? byName(parsed.people[0]) : null)
    if (!other) return { draft: null, error: 'Who was the payment with?', model }
    return {
      model,
      draft: {
        kind: 'settlement', amount, description: 'Payment', needLevel: null, category: 'other',
        paymentMethodId: payerFriend ? null : method?.id || null,
        date: dateFromDay(parsed.date || todayIST()).toISOString(),
        groupId: null, groupName: null, friendIds: [other.id],
        paidById: payerFriend ? payerFriend.id : ctx.userId,
        toUserId: payerFriend ? ctx.userId : other.id,
        splitMode: 'equal', splits: null,
        people: [{ id: other.id, name: other.displayName }],
        notes: [], via: model === 'rules' ? 'quick' : 'ai', needsReview: false,
      },
    }
  }

  const people = parsed.people.map(byName).filter(Boolean) as { id: string; displayName: string }[]
  const payer = parsed.paid_by === 'me' ? null : byName(parsed.paid_by)
  if (payer && !people.some((p) => p.id === payer.id)) people.push(payer)

  return {
    model,
    draft: await finish(ctx, {
      description: titleCase(parsed.description || 'Expense'),
      amount,
      needLevel: parsed.need,
      category: parsed.category,
      paymentMethodId: method?.id || null,
      day: parsed.date,
      groupId: group?.id || null,
      groupName: group?.name || null,
      friendIds: group ? [] : people.map((p) => p.id),
      paidById: payer?.id,
      split: parsed.split,
      shares: parsed.shares,
      via: model === 'rules' ? 'quick' : 'ai',
    }),
  }
}

async function quickDraft(raw: string, ctx: EntryContext): Promise<Draft | null> {
  const q = parseQuickText(raw)
  if (q.error) return null
  let groupId: string | null = null
  let groupName: string | null = null
  if (q.tag && !ledger.PERSONAL_TAGS.has(q.tag)) {
    const g = ctx.groups.find((x) => x.name.toLowerCase().replace(/\s+/g, '').startsWith(q.tag.replace(/\s+/g, '')))
    if (g) { groupId = g.id; groupName = g.name }
  }
  return finish(ctx, { description: titleCase(q.description), amount: q.amount, groupId, groupName, via: 'quick' })
}

interface DraftInput {
  description: string
  amount: number
  needLevel?: NeedLevel | null
  category?: string | null
  paymentMethodId?: string | null
  day?: string | null
  groupId?: string | null
  groupName?: string | null
  friendIds?: string[]
  paidById?: string
  split?: 'equal' | 'exact' | 'full' | null
  shares?: { name: string; amount: number }[]
  via: 'quick' | 'ai'
}

/** Fill gaps from history, work out splits, and flag anything worth a second look. */
async function finish(ctx: EntryContext, p: DraftInput): Promise<Draft> {
  const notes: string[] = []
  const recall = await ledger.recallByDescription(prisma, ctx.userId, p.description)
  const paidById = p.paidById || ctx.userId
  const iPaid = paidById === ctx.userId
  let paymentMethodId = p.paymentMethodId || null
  if (iPaid && !paymentMethodId) {
    paymentMethodId = recall?.paymentMethodId || (await ledger.lastUsedMethodId(prisma, ctx.userId)) || ctx.methods[0]?.id || null
  }
  if (!iPaid) paymentMethodId = null

  const friendIds = p.friendIds || []
  const nameOf = (id: string) => (id === ctx.userId ? ctx.meName : ctx.friends.find((f) => f.id === id)?.displayName || 'Someone')

  let groupId = p.groupId || null
  let groupName = p.groupName || null
  // Plain "milk 20": reuse the ledger you used last time for this item (e.g. the flat group).
  if (!groupId && !friendIds.length && p.via === 'quick' && recall?.groupId) {
    const g = ctx.groups.find((x) => x.id === recall.groupId)
    if (g) { groupId = g.id; groupName = g.name }
  }

  let participants: string[] = []
  if (groupId) participants = ctx.groups.find((g) => g.id === groupId)?.members.map((m) => m.user.id) || []
  else if (friendIds.length) participants = [ctx.userId, ...friendIds]

  let splitMode: Draft['splitMode'] = 'equal'
  let splits: Draft['splits'] = null
  if (participants.length) {
    if (p.split === 'full') {
      // Everyone except the payer owes the whole amount between them.
      const owers = participants.filter((id) => id !== paidById)
      if (owers.length) {
        splitMode = 'full'
        splits = ledger.equalSplits(p.amount, owers)
      }
    } else if (p.split === 'exact' && p.shares?.length) {
      const mapped = p.shares.map((s) => ({
        userId: s.name === 'me' ? ctx.userId : ctx.friends.find((f) => f.displayName === s.name)?.id || '',
        amount: Math.round(s.amount * 100),
      })).filter((s) => s.userId && participants.includes(s.userId))
      const sum = mapped.reduce((a, s) => a + s.amount, 0)
      if (sum === p.amount) { splitMode = 'exact'; splits = mapped }
      else notes.push('Shares didn’t add up, so it’s split equally')
    }
  }

  const people = participants.filter((id) => id !== ctx.userId).map((id) => ({ id, name: nameOf(id) }))
  const category = p.category || recall?.category || guessCategory(p.description)
  const needLevel = p.needLevel || (recall?.needLevel as NeedLevel | null) || NEED_BY_CATEGORY[category] || null

  return {
    kind: 'expense',
    amount: p.amount,
    description: p.description,
    needLevel,
    category,
    paymentMethodId,
    date: dateFromDay(p.day || todayIST()).toISOString(),
    groupId,
    groupName,
    friendIds: groupId ? [] : friendIds,
    paidById,
    splitMode,
    splits,
    toUserId: null,
    people,
    notes,
    via: p.via,
    needsReview: false,
  }
}

/** Persist a (possibly user-edited) draft. Returns a one-line summary for notifications. */
export async function saveDraft(userId: string, d: Draft, source: string) {
  const friendIds = new Set((await ledger.listFriends(prisma, userId)).map((f: { id: string }) => f.id))
  const others = [...(d.friendIds || []), d.paidById, d.toUserId].filter((id): id is string => !!id && id !== userId)
  if (others.some((id) => !friendIds.has(id))) throw new ledger.LedgerError('You can only split with friends', 403)
  if (!Number.isInteger(d.amount) || d.amount <= 0) throw new ledger.LedgerError('Enter an amount', 400)
  if (Number.isNaN(new Date(d.date).getTime())) throw new ledger.LedgerError('Invalid date', 400)

  if (d.kind === 'settlement') {
    if (!d.toUserId) throw new ledger.LedgerError('Who was paid?', 400)
    await ledger.recordSettlement(prisma, {
      userId, fromId: d.paidById, toId: d.toUserId, amount: d.amount, date: new Date(d.date), paymentMethodId: d.paymentMethodId,
    })
    const other = d.people[0]?.name || 'friend'
    const msg = d.paidById === userId ? `✅ Paid ${other} ${ledger.formatINR(d.amount)}` : `✅ ${other} paid you ${ledger.formatINR(d.amount)}`
    return { message: msg, expense: null }
  }

  let group
  if (d.groupId) {
    group = await prisma.group.findFirst({ where: { id: d.groupId, deletedAt: null, members: { some: { userId } } } })
    if (!group) throw new ledger.LedgerError('Group not found', 404)
  } else if (d.friendIds.length) {
    group = await ledger.getOrCreateDirectGroup(prisma, [userId, ...d.friendIds])
  } else {
    group = await ledger.getOrCreatePersonalGroup(prisma, userId)
  }
  const expense = await ledger.createExpense(prisma, {
    userId,
    group,
    description: d.description,
    amount: d.amount,
    category: d.category,
    date: new Date(d.date),
    source,
    paidById: d.paidById,
    splits: d.splitMode === 'equal' ? null : d.splits,
    splitType: d.splitMode === 'equal' ? 'equal' : 'exact',
    needLevel: d.needLevel,
    paymentMethodId: d.paymentMethodId,
    needsReview: !!d.needsReview,
  })
  return { message: ledger.describeExpense(expense) + (d.needsReview ? ' — check it in the app' : ''), expense }
}

/* ------------------------------------------------------------------ */
/* Manual add / edit from the expense editor                            */
/* ------------------------------------------------------------------ */

export interface ExpenseInput {
  description: string
  amount: number // paise
  needLevel: NeedLevel | null
  paymentMethodId: string | null
  date: string // YYYY-MM-DD
  target: { type: 'personal' } | { type: 'friends'; ids: string[] } | { type: 'group'; id: string }
  paidById?: string
  splitMode: 'equal' | 'exact' | 'full'
  participants?: string[] // for equal: who shares it (defaults to everyone in the ledger)
  splits?: { userId: string; amount: number }[] // for exact
  category?: string | null
}

const NEED_LABEL: Record<string, string> = { essential: 'Essential', semi: 'Semi-essential', luxury: 'Luxury' }

async function resolveTargetGroup(userId: string, t: ExpenseInput['target']) {
  if (t.type === 'group') {
    const g = await prisma.group.findFirst({ where: { id: t.id, deletedAt: null, members: { some: { userId } } } })
    if (!g) throw new ledger.LedgerError('Group not found', 404)
    return g
  }
  if (t.type === 'friends' && t.ids.length) {
    const friends = new Set((await ledger.listFriends(prisma, userId)).map((f: { id: string }) => f.id))
    if (t.ids.some((id) => !friends.has(id))) throw new ledger.LedgerError('You can only split with friends', 403)
    return ledger.getOrCreateDirectGroup(prisma, [userId, ...t.ids])
  }
  return ledger.getOrCreatePersonalGroup(prisma, userId)
}

function computeSplits(input: ExpenseInput, memberIds: string[], payer: string) {
  const amount = input.amount
  if (memberIds.length === 1) return [{ userId: memberIds[0], amount }]
  if (input.splitMode === 'exact') {
    const splits = (input.splits || []).map((s) => ({ userId: s.userId, amount: Math.round(Number(s.amount) || 0) })).filter((s) => s.amount > 0)
    return splits
  }
  if (input.splitMode === 'full') {
    const owers = memberIds.filter((id) => id !== payer && (!input.participants?.length || input.participants.includes(id)))
    if (!owers.length) throw new ledger.LedgerError('Pick who owes this', 400)
    return ledger.equalSplits(amount, owers)
  }
  const chosen = input.participants?.length ? memberIds.filter((id) => input.participants!.includes(id)) : memberIds
  if (!chosen.length) throw new ledger.LedgerError('Pick at least one person to split with', 400)
  const ordered = chosen.includes(payer) ? [payer, ...chosen.filter((id) => id !== payer)] : chosen
  return ledger.equalSplits(amount, ordered)
}

export async function saveInput(userId: string, input: ExpenseInput, source: string, expenseId?: string) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ledger.LedgerError('Enter an amount', 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) throw new ledger.LedgerError('Invalid date', 400)
  const group = await resolveTargetGroup(userId, input.target)
  const members = await prisma.groupMember.findMany({ where: { groupId: group.id }, orderBy: { joinedAt: 'asc' }, select: { userId: true } })
  const memberIds = members.map((m) => m.userId)
  const payer = input.paidById && memberIds.includes(input.paidById) ? input.paidById : userId
  const splits = computeSplits(input, memberIds, payer)
  const description = input.description?.trim() || (input.needLevel ? NEED_LABEL[input.needLevel] : 'Expense')
  const needLevel = input.needLevel && ['essential', 'semi', 'luxury'].includes(input.needLevel) ? input.needLevel : null

  if (!expenseId) {
    const expense = await ledger.createExpense(prisma, {
      userId, group, description, amount: input.amount, category: input.category || guessCategory(description),
      date: dateFromDay(input.date), source, paidById: payer, splits, splitType: input.splitMode,
      needLevel, paymentMethodId: input.paymentMethodId,
    })
    return expense
  }

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, deletedAt: null, group: { members: { some: { userId } } } },
  })
  if (!existing) throw new ledger.LedgerError('Expense not found', 404)
  const resolved = await ledger.resolveSplits(prisma, { group, amount: input.amount, payer, splits })
  let methodId: string | null = null
  if (payer === userId && input.paymentMethodId) {
    const m = await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId }, select: { id: true } })
    methodId = m?.id || null
  } else if (payer !== userId) {
    methodId = existing.paidById === payer ? existing.paymentMethodId : null
  }
  return prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } })
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: {
        groupId: group.id,
        description,
        amount: input.amount,
        category: input.category || (description !== existing.description ? guessCategory(description) : existing.category),
        date: dateFromDay(input.date),
        paidById: payer,
        needLevel,
        paymentMethodId: methodId,
        splitType: input.splitMode,
        needsReview: false,
        splits: { create: resolved },
      },
      include: ledger.EXPENSE_INCLUDE,
    })
    await tx.activity.create({
      data: {
        groupId: group.id, userId, type: 'expense_edited',
        metadata: JSON.stringify({ expenseId, description, amount: input.amount, before: { amount: existing.amount, description: existing.description } }),
      },
    })
    return updated
  })
}
