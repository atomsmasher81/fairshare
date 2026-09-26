/**
 * FairShare as an MCP server: lets Claude (or any MCP client) log expenses, read your month
 * and balances, and settle up — always as the user who owns the Bearer key.
 * Amounts in and out are rupees; internally everything stays integer paise.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { draftFromText, loadContext, saveDraft, saveInput, todayIST, type ExpenseInput } from '@/lib/entry'
import { balances, entriesFor, groupLedger, groupsWithBalance, monthRange, summarize, type Entry } from '@/lib/queries'
import { inr, istDay, NEED_META, categoryMeta, type Need } from '@/lib/format'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { notifyExpenseSplitMembers, notifyPayment } = require('@/lib/telegram-notifications')

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })
const toPaise = (rupees: number) => Math.round(rupees * 100)

function entryLine(e: Entry) {
  const day = istDay(e.date)
  if (e.kind === 'payment') return `${day}  ${e.description}  ${inr(e.amount)}  [payment ${e.id}]`
  const bits = [
    e.ledger.kind === 'personal' ? 'personal' : e.ledger.kind === 'group' ? `group: ${e.ledger.name}` : `with ${e.people.join(', ')}`,
    e.needLevel ? NEED_META[e.needLevel as Need].label : null,
    e.method,
    categoryMeta(e.category).label,
  ].filter(Boolean)
  const impact = e.impact > 0 ? ` · lent ${inr(e.impact)}` : e.impact < 0 ? ` · borrowed ${inr(-e.impact)}` : ''
  const whole = e.ledger.kind !== 'personal' ? ` (total ${inr(e.amount)}, paid by ${e.paidByName})` : ''
  return `${day}  ${e.description}  your share ${inr(e.share)}${whole}${impact}  — ${bits.join(' · ')}  [id ${e.id}]`
}

/** Match a friend by full name, first name or username, case-insensitive. */
function findFriend(friends: { id: string; displayName: string; username?: string }[], name: string) {
  const q = name.trim().toLowerCase().replace(/^@/, '')
  const exact = friends.filter((f) => f.displayName.toLowerCase() === q || f.username?.toLowerCase() === q)
  if (exact.length === 1) return { friend: exact[0] }
  const first = friends.filter((f) => f.displayName.toLowerCase().split(' ')[0] === q)
  if (first.length === 1) return { friend: first[0] }
  const partial = friends.filter((f) => f.displayName.toLowerCase().includes(q))
  if (partial.length === 1) return { friend: partial[0] }
  const pool = exact.length ? exact : first.length ? first : partial
  if (pool.length > 1) return { error: `“${name}” matches ${pool.map((f) => f.displayName).join(', ')} — be more specific.` }
  return { error: `No friend called “${name}”. Friends: ${friends.map((f) => f.displayName).join(', ') || 'none yet'}.` }
}

export function createFairShareMcp(userId: string) {
  const server = new McpServer(
    { name: 'fairshare', version: '1.0.0' },
    {
      instructions:
        'FairShare tracks the user’s personal spending (with a need level: essential / semi-essential / luxury, and a payment method) ' +
        'and shared expenses with friends and groups. Amounts are Indian rupees. Call get_context first to learn the user’s friends, ' +
        'groups and payment methods. Prefer log_expense for anything the user says in plain words; use add_expense when you already ' +
        'have structured fields. Confirm with the user before delete_expense or record_payment.',
    },
  )

  server.registerTool('get_context', {
    title: 'Friends, groups and payment methods',
    description: 'Who the user can split with, their groups, and their payment methods (e.g. PhonePe, Credit card). Call this before adding expenses.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const ctx = await loadContext(userId)
    return text([
      `You are logged in as ${ctx.meName}. Today is ${todayIST()} (India time).`,
      `Payment methods: ${ctx.methods.map((m) => m.name).join(', ') || 'none'}`,
      `Friends: ${ctx.friends.map((f) => f.displayName).join(', ') || 'none'}`,
      `Groups: ${ctx.groups.map((g) => `${g.name} (${g.members.map((m) => m.user.displayName).join(', ')})`).join('; ') || 'none'}`,
      'Need levels: essential, semi (semi-essential), luxury.',
    ].join('\n'))
  })

  server.registerTool('log_expense', {
    title: 'Log an expense from plain words',
    description:
      'Save an expense or payment described in natural language, exactly like the user’s Siri shortcut. Examples: "milk 60", ' +
      '"dinner 1800 with Rahul and Amit on card", "Rahul paid 500 for the cab", "paid Amit back 300", "groceries 640 yesterday essential". ' +
      'Returns what was saved and its id.',
    inputSchema: { text: z.string().min(1).max(500).describe('What was spent, in the user’s words') },
  }, async ({ text: said }) => {
    const ctx = await loadContext(userId)
    const { draft, error } = await draftFromText(said, ctx)
    if (!draft) return fail(error || 'Couldn’t understand that.')
    const saved = await saveDraft(userId, draft, 'mcp')
    if (saved.expense && !saved.expense.group.isPersonal) {
      notifyExpenseSplitMembers({ prisma, expense: saved.expense, group: saved.expense.group, excludeUserIds: [userId] }).catch(() => {})
    }
    if (draft.kind === 'settlement' && draft.toUserId) {
      notifyPayment({ prisma, actorId: userId, fromUserId: draft.paidById, toUserId: draft.toUserId, amount: draft.amount }).catch(() => {})
    }
    return text(`${saved.message.replace(/^✅\s*/, 'Saved: ')}${saved.expense ? ` [id ${saved.expense.id}]` : ''}`)
  })

  server.registerTool('add_expense', {
    title: 'Add an expense with exact fields',
    description: 'Add an expense when you already know the details. Leave split_with and group empty for a personal expense.',
    inputSchema: {
      amount: z.number().positive().describe('Total amount in rupees'),
      description: z.string().max(120).optional().describe('What it was for, e.g. "Groceries"'),
      need: z.enum(['essential', 'semi', 'luxury']).optional().describe('Need level'),
      payment_method: z.string().optional().describe('One of the user’s payment methods (only when the user paid)'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, defaults to today'),
      split_with: z.array(z.string()).optional().describe('Friend names to split with (outside any group)'),
      group: z.string().optional().describe('Group name to split within'),
      paid_by: z.string().optional().describe('"me" (default) or a friend’s name'),
      split: z.enum(['equal', 'they_owe_all']).optional().describe('Equal split (default), or everyone except the payer owes the whole amount'),
    },
  }, async (a) => {
    const ctx = await loadContext(userId)
    const friendsFull = ctx.friends as { id: string; displayName: string; username?: string }[]
    let target: ExpenseInput['target'] = { type: 'personal' }
    if (a.group) {
      const g = ctx.groups.find((x) => x.name.toLowerCase() === a.group!.toLowerCase())
        || ctx.groups.find((x) => x.name.toLowerCase().includes(a.group!.toLowerCase()))
      if (!g) return fail(`No group called “${a.group}”. Groups: ${ctx.groups.map((x) => x.name).join(', ') || 'none'}.`)
      target = { type: 'group', id: g.id }
    } else if (a.split_with?.length) {
      const ids: string[] = []
      for (const n of a.split_with) {
        const r = findFriend(friendsFull, n)
        if (r.error) return fail(r.error)
        ids.push(r.friend!.id)
      }
      target = { type: 'friends', ids }
    }
    let paidById = userId
    if (a.paid_by && a.paid_by.toLowerCase() !== 'me') {
      const r = findFriend(friendsFull, a.paid_by)
      if (r.error) return fail(r.error)
      paidById = r.friend!.id
    }
    let methodId: string | null = null
    if (a.payment_method) {
      const m = ctx.methods.find((x) => x.name.toLowerCase() === a.payment_method!.toLowerCase())
        || ctx.methods.find((x) => x.name.toLowerCase().includes(a.payment_method!.toLowerCase()))
      if (!m) return fail(`No payment method “${a.payment_method}”. Methods: ${ctx.methods.map((x) => x.name).join(', ')}.`)
      methodId = m.id
    }
    try {
      const expense = await saveInput(userId, {
        description: a.description || '',
        amount: toPaise(a.amount),
        needLevel: a.need || null,
        paymentMethodId: methodId,
        date: a.date || todayIST(),
        target,
        paidById,
        splitMode: a.split === 'they_owe_all' ? 'full' : 'equal',
      }, 'mcp')
      if (!expense.group.isPersonal) {
        notifyExpenseSplitMembers({ prisma, expense, group: expense.group, excludeUserIds: [userId] }).catch(() => {})
      }
      return text(`${ledger.describeExpense(expense).replace(/^✅\s*/, 'Saved: ')} [id ${expense.id}]`)
    } catch (e) {
      return fail((e as { publicMessage?: string }).publicMessage || 'Couldn’t save that expense.')
    }
  })

  server.registerTool('list_transactions', {
    title: 'List transactions',
    description: 'Expenses and payments for a month, newest first, from the user’s point of view (their share, what they lent or borrowed).',
    inputSchema: {
      month_offset: z.number().int().min(-120).max(0).optional().describe('0 = this month (default), -1 = last month…'),
      scope: z.enum(['all', 'personal', 'shared']).optional(),
      limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ month_offset = 0, scope = 'all', limit = 50 }) => {
    const m = monthRange(month_offset)
    let list = await entriesFor(userId, m.from, m.to)
    if (scope === 'personal') list = list.filter((e) => e.ledger.kind === 'personal')
    if (scope === 'shared') list = list.filter((e) => e.ledger.kind !== 'personal')
    if (!list.length) return text(`No transactions in ${m.longLabel}.`)
    return text(`${m.longLabel} — ${list.length} transaction(s)${list.length > limit ? `, showing ${limit}` : ''}:\n${list.slice(0, limit).map(entryLine).join('\n')}`)
  })

  server.registerTool('month_summary', {
    title: 'Monthly summary',
    description: 'What a month cost the user: total, vs previous month, split by need level, category and payment method, and the biggest expenses.',
    inputSchema: { month_offset: z.number().int().min(-120).max(0).optional().describe('0 = this month (default), -1 = last month…') },
    annotations: { readOnlyHint: true },
  }, async ({ month_offset = 0 }) => {
    const m = monthRange(month_offset)
    const p = monthRange(month_offset - 1)
    const [cur, prev] = await Promise.all([entriesFor(userId, m.from, m.to), entriesFor(userId, p.from, p.to)])
    const s = summarize(cur, m.dayOfMonth || m.daysInMonth)
    const ps = summarize(prev, p.daysInMonth)
    const pct = (v: number) => (s.spent ? `${Math.round((v / s.spent) * 100)}%` : '0%')
    const lines = [
      `${m.longLabel}: spent ${inr(s.spent)} across ${s.count} expenses (${inr(s.dailyAvg, { decimals: 'never' })}/day).`,
      ps.spent ? `${p.label}: ${inr(ps.spent)} (${s.spent >= ps.spent ? '+' : '−'}${inr(Math.abs(s.spent - ps.spent))}).` : '',
      `By need: essential ${inr(s.byNeed.essential)} (${pct(s.byNeed.essential)}), semi ${inr(s.byNeed.semi)} (${pct(s.byNeed.semi)}), luxury ${inr(s.byNeed.luxury)} (${pct(s.byNeed.luxury)})${s.byNeed.unset ? `, no type ${inr(s.byNeed.unset)}` : ''}.`,
      `By category: ${s.byCategory.map(([c, v]) => `${categoryMeta(c).label} ${inr(v)}`).join(', ') || '—'}.`,
      `Paid out via: ${s.byMethod.map(([k, v]) => `${k} ${inr(v)}`).join(', ') || '—'}.`,
      s.top.length ? `Biggest: ${s.top.map((e) => `${e.description} ${inr(e.share)}`).join(', ')}.` : '',
      'Spent = personal expenses + the user’s share of shared ones.',
    ]
    return text(lines.filter(Boolean).join('\n'))
  })

  server.registerTool('balances', {
    title: 'Who owes whom',
    description: 'Overall what the user is owed and owes, and the net balance with each friend (positive = they owe the user).',
    annotations: { readOnlyHint: true },
  }, async () => {
    const b = await balances(userId)
    const rows = b.friends.filter((f) => f.net !== 0).sort((x, y) => Math.abs(y.net) - Math.abs(x.net))
      .map((f) => `${f.user.displayName}: ${f.net > 0 ? `owes you ${inr(f.net)}` : `you owe ${inr(-f.net)}`}${f.groups.length > 1 ? ` (${f.groups.map((g) => `${g.name} ${g.net > 0 ? '+' : '−'}${inr(Math.abs(g.net))}`).join(', ')})` : ''}`)
    return text([`You’re owed ${inr(b.owed)} · you owe ${inr(b.owe)}.`, ...(rows.length ? rows : ['Everyone is settled up.'])].join('\n'))
  })

  server.registerTool('friend_history', {
    title: 'History with a friend',
    description: 'Balance and recent shared expenses/payments with one friend.',
    inputSchema: { friend: z.string().describe('Friend’s name'), limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ friend, limit = 30 }) => {
    const b = await balances(userId)
    const r = findFriend(b.friends.map((f) => ({ id: f.user.id, displayName: f.user.displayName, username: f.user.username })), friend)
    if (r.error) return fail(r.error)
    const f = b.friends.find((x) => x.user.id === r.friend!.id)!
    const list = await entriesFor(userId, undefined, undefined, { friendId: f.user.id, take: limit })
    const head = f.net > 0 ? `${f.user.displayName} owes you ${inr(f.net)}.` : f.net < 0 ? `You owe ${f.user.displayName} ${inr(-f.net)}.` : `You and ${f.user.displayName} are settled up.`
    return text([head, ...list.map(entryLine)].join('\n'))
  })

  server.registerTool('groups', {
    title: 'Groups',
    description: 'The user’s groups with their balance in each and the simplest payments to settle the group.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const gs = await groupsWithBalance(userId)
    if (!gs.length) return text('No groups yet.')
    const out: string[] = []
    for (const g of gs) {
      const gl = await groupLedger(g.id)
      const name = (id: string) => (id === userId ? 'You' : gl?.members.find((m) => m.id === id)?.displayName || '?')
      out.push(`${g.name} (${g.members.map((m) => m.displayName).join(', ')}): ${g.net === 0 ? 'settled up' : g.net > 0 ? `you’re owed ${inr(g.net)}` : `you owe ${inr(-g.net)}`}`)
      for (const t of gl?.transfers || []) out.push(`  ${name(t.from)} → ${name(t.to)} ${inr(t.amount)}`)
    }
    return text(out.join('\n'))
  })

  server.registerTool('record_payment', {
    title: 'Record a payment (settle up)',
    description: 'Record money that changed hands with a friend. Confirm with the user first.',
    inputSchema: {
      friend: z.string(),
      direction: z.enum(['i_paid', 'they_paid']).describe('i_paid = the user paid the friend; they_paid = the friend paid the user'),
      amount: z.number().positive().describe('Rupees'),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ friend, direction, amount }) => {
    const friends = await ledger.listFriends(prisma, userId)
    const r = findFriend(friends, friend)
    if (r.error) return fail(r.error)
    const other = r.friend!
    const fromId = direction === 'i_paid' ? userId : other.id
    const toId = direction === 'i_paid' ? other.id : userId
    try {
      await ledger.recordSettlement(prisma, { userId, fromId, toId, amount: toPaise(amount), date: new Date() })
    } catch (e) {
      return fail((e as { publicMessage?: string }).publicMessage || 'Couldn’t record the payment.')
    }
    notifyPayment({ prisma, actorId: userId, fromUserId: fromId, toUserId: toId, amount: toPaise(amount) }).catch(() => {})
    return text(direction === 'i_paid' ? `Recorded: you paid ${other.displayName} ${inr(toPaise(amount))}.` : `Recorded: ${other.displayName} paid you ${inr(toPaise(amount))}.`)
  })

  server.registerTool('delete_expense', {
    title: 'Delete an expense',
    description: 'Delete an expense by id (from list_transactions). It can be restored from the app. Confirm with the user first.',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ id }) => {
    const e = await prisma.expense.findFirst({
      where: { id, deletedAt: null, group: { members: { some: { userId } } } },
      include: {
        group: { select: { id: true, name: true, isPersonal: true, isDirect: true } },
        paidBy: { select: { id: true, displayName: true } },
        splits: { include: { user: { select: { id: true, displayName: true } } } },
      },
    })
    if (!e) return fail('Expense not found.')
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } })
    await prisma.activity.create({ data: { groupId: e.groupId, userId, type: 'expense_deleted', metadata: JSON.stringify({ expenseId: id, description: e.description, amount: e.amount, via: 'mcp' }) } })
    if (!e.group.isPersonal) {
      notifyExpenseSplitMembers({ prisma, expense: e, group: e.group, excludeUserIds: [userId], action: 'deleted' }).catch(() => {})
    }
    return text(`Deleted “${e.description}” (${inr(e.amount)}).`)
  })

  return server
}
