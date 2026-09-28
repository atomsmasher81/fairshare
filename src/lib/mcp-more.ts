/**
 * The rest of FairShare over MCP, so an assistant can do everything the app can:
 * search / inspect / edit / restore expenses, undo payments, the timeline, the To-sort inbox,
 * friends, groups and members, payment methods, and profile & AI settings.
 * (API keys and notification subscriptions stay app-only on purpose.)
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { loadContext, saveInput, type ExpenseInput } from '@/lib/entry'
import { entriesFor, groupLedger, timeline, type Entry } from '@/lib/queries'
import { inr, istDay, NEED_META, CATEGORIES, categoryMeta, type Need } from '@/lib/format'
import { generateInviteCode } from '@/lib/auth'
import { SITE } from '@/lib/site'
import { netWorth, accountDetail, recordValues, kindMeta, ASSET_KIND_KEYS } from '@/lib/wealth'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')
const { notifyExpenseSplitMembers, notifyPaymentChange, notifyAddedToGroup } = require('@/lib/telegram-notifications')

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })
const toPaise = (rupees: number) => Math.round(rupees * 100)
const errMsg = (e: unknown, fallback: string) => (e as { publicMessage?: string }).publicMessage || fallback

type Named = { id: string; displayName: string; username?: string }

function findOne<T extends { name: string }>(list: T[], name: string, what: string): { item?: T; error?: string } {
  const q = name.trim().toLowerCase()
  const exact = list.filter((x) => x.name.toLowerCase() === q)
  if (exact.length === 1) return { item: exact[0] }
  const first = list.filter((x) => x.name.toLowerCase().split(' ')[0] === q)
  if (first.length === 1) return { item: first[0] }
  const partial = list.filter((x) => x.name.toLowerCase().includes(q))
  if (partial.length === 1) return { item: partial[0] }
  const pool = exact.length ? exact : first.length ? first : partial
  if (pool.length > 1) return { error: `“${name}” matches ${pool.map((x) => x.name).join(', ')} — be more specific.` }
  return { error: `No ${what} called “${name}”. ${what[0].toUpperCase() + what.slice(1)}s: ${list.map((x) => x.name).join(', ') || 'none'}.` }
}

const friendList = (fs: Named[]) => fs.map((f) => ({ id: f.id, name: f.displayName }))

function entryLine(e: Entry) {
  const day = istDay(e.date)
  const del = e.deleted ? ` [DELETED${e.deleted.by ? ` by ${e.deleted.by}` : ''}]` : ''
  if (e.kind === 'payment') return `${day}  ${e.description}  ${inr(e.amount)}${del}  [payment ${e.id}]`
  const where = e.ledger.kind === 'personal' ? 'personal' : e.ledger.kind === 'group' ? `group: ${e.ledger.name}` : `with ${e.people.join(', ')}`
  const bits = [where, e.needLevel ? NEED_META[e.needLevel as Need].label : null, e.method, categoryMeta(e.category).label].filter(Boolean)
  const whole = e.ledger.kind !== 'personal' ? ` (total ${inr(e.amount)}, paid by ${e.paidByName})` : ''
  return `${day}  ${e.description}  your share ${inr(e.share)}${whole}${e.edited ? ' (edited)' : ''}${del} — ${bits.join(' · ')}  [id ${e.id}]`
}

/** Rebuild the editor's view of an expense so a partial edit keeps everything else as it was. */
async function currentInput(userId: string, id: string): Promise<{ input: ExpenseInput; expense: { id: string; description: string } } | null> {
  const e = await prisma.expense.findFirst({
    where: { id, deletedAt: null, group: { deletedAt: null, members: { some: { userId } } } },
    include: { splits: true, group: { select: { id: true, isPersonal: true, isDirect: true, members: { select: { userId: true } } } } },
  })
  if (!e) return null
  const memberIds = e.group.members.map((m) => m.userId)
  const target: ExpenseInput['target'] = e.group.isPersonal ? { type: 'personal' }
    : e.group.isDirect ? { type: 'friends', ids: memberIds.filter((m) => m !== userId) }
    : { type: 'group', id: e.group.id }
  const ids = e.splits.map((s) => s.userId)
  const amounts = e.splits.map((s) => s.amount)
  const evenish = amounts.length > 0 && Math.max(...amounts) - Math.min(...amounts) <= 1
  let splitMode: ExpenseInput['splitMode'] = 'exact'
  let participants: string[] | undefined
  if (memberIds.length <= 1) splitMode = 'equal'
  else if (evenish && !ids.includes(e.paidById) && ids.length === memberIds.length - 1) splitMode = 'full'
  else if (evenish) { splitMode = 'equal'; participants = ids.length === memberIds.length ? undefined : ids }
  return {
    expense: { id: e.id, description: e.description },
    input: {
      description: e.description, amount: e.amount, needLevel: (e.needLevel as ExpenseInput['needLevel']) || null,
      paymentMethodId: e.paymentMethodId, assetId: e.assetId, date: istDay(e.date), target, paidById: e.paidById, splitMode,
      participants, splits: e.splits.map((s) => ({ userId: s.userId, amount: s.amount })), category: e.category,
    },
  }
}

export function registerMoreTools(server: McpServer, userId: string) {
  /* ---------------- expenses: find, inspect, edit, restore ---------------- */

  server.registerTool('search_expenses', {
    title: 'Search expenses and payments',
    description: 'Find expenses/payments by words, date range, friend, group, need level, payment method or category. Can include deleted ones. Returns ids for get_expense / edit_expense.',
    inputSchema: {
      query: z.string().optional().describe('Words to match in the description, people or group'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD (default: 90 days ago)'),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD inclusive (default: today)'),
      friend: z.string().optional(),
      group: z.string().optional(),
      need: z.enum(['essential', 'semi', 'luxury', 'investment', 'none']).optional(),
      payment_method: z.string().optional(),
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      include_deleted: z.boolean().optional(),
      limit: z.number().int().min(1).max(300).optional().describe('Default 50'),
    },
    annotations: { readOnlyHint: true },
  }, async (a) => {
    const ctx = await loadContext(userId)
    const from = a.from ? new Date(`${a.from}T00:00:00+05:30`) : new Date(Date.now() - 90 * 86400e3)
    const to = a.to ? new Date(new Date(`${a.to}T00:00:00+05:30`).getTime() + 86400e3) : new Date(Date.now() + 86400e3)
    let friendId: string | undefined
    if (a.friend) {
      const r = findOne(friendList(ctx.friends as Named[]), a.friend, 'friend')
      if (r.error) return fail(r.error)
      friendId = r.item!.id
    }
    let groupId: string | undefined
    if (a.group) {
      const r = findOne(ctx.groups, a.group, 'group')
      if (r.error) return fail(r.error)
      groupId = r.item!.id
    }
    let list = await entriesFor(userId, from, to, { friendId, groupId, everyone: !!groupId, includeDeleted: !!a.include_deleted })
    const q = a.query?.trim().toLowerCase()
    if (q) list = list.filter((e) => [e.description, e.ledger.name, ...e.people].some((s) => s.toLowerCase().includes(q)))
    if (a.need) list = list.filter((e) => (a.need === 'none' ? !e.needLevel && e.kind === 'expense' : e.needLevel === a.need))
    if (a.payment_method) list = list.filter((e) => (e.method || '').toLowerCase().includes(a.payment_method!.toLowerCase()))
    if (a.category) list = list.filter((e) => e.category === a.category)
    const limit = a.limit || 50
    if (!list.length) return text('Nothing found.')
    const total = list.filter((e) => !e.deleted && e.kind === 'expense').reduce((s, e) => s + e.share, 0)
    return text([`${list.length} found (your share of matching expenses: ${inr(total)})${list.length > limit ? `, showing ${limit}` : ''}:`, ...list.slice(0, limit).map(entryLine)].join('\n'))
  })

  server.registerTool('get_expense', {
    title: 'Expense details',
    description: 'Everything about one expense: amount, who paid, each person’s share, need level, method, category, date, where it lives, what was originally said (Siri text) and what parsed it, plus its full edit history.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const e = await prisma.expense.findFirst({
      where: { id, group: { members: { some: { userId } } } },
      include: {
        paidBy: { select: { displayName: true } }, paymentMethod: { select: { name: true } },
        group: { select: { name: true, isPersonal: true, isDirect: true } },
        splits: { include: { user: { select: { displayName: true } } } },
      },
    })
    if (!e) return fail('Expense not found.')
    const hist = (await timeline(userId, { expenseId: id, take: 30 })).items
    const where = e.group.isPersonal ? 'Personal' : e.group.isDirect ? `with ${e.splits.map((s) => s.user.displayName).filter((n) => n !== e.paidBy.displayName).join(', ') || 'a friend'}` : `group ${e.group.name}`
    return text([
      `${e.description} — ${inr(e.amount)} on ${istDay(e.date)} · ${where}${e.deletedAt ? ' · DELETED (restorable)' : ''}`,
      `Paid by ${e.paidBy.displayName}${e.paymentMethod ? ` via ${e.paymentMethod.name}` : ''} · ${e.needLevel ? NEED_META[e.needLevel as Need].label : 'no need level'} · ${categoryMeta(e.category).label}`,
      `Shares: ${e.splits.map((s) => `${s.user.displayName} ${inr(s.amount)}`).join(', ')}`,
      e.inputText ? `Originally ${e.inputVia === 'siri' ? 'said to Siri' : `entered via ${e.inputVia}`}: “${e.inputText}” — parsed by ${e.parsedBy || 'unknown'}` : '',
      hist.length ? 'History:\n' + hist.map((h) => `  ${h.at.slice(0, 16).replace('T', ' ')} ${h.actor} ${h.verb}${h.changes.length ? ': ' + h.changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join('; ') : ''}`).join('\n') : '',
    ].filter(Boolean).join('\n'))
  })

  server.registerTool('edit_expense', {
    title: 'Edit an expense',
    description: 'Change any field of an expense; anything you leave out stays the same. Use split_with / group / "personal" to move it. Everyone involved is notified and the change appears in the timeline.',
    inputSchema: {
      id: z.string(),
      amount: z.number().positive().optional().describe('Rupees'),
      description: z.string().max(120).optional(),
      need: z.enum(['essential', 'semi', 'luxury', 'investment', 'none']).optional(),
      payment_method: z.string().optional().describe('A payment method name, or "none"'),
      account: z.string().optional().describe('For investments: the net-worth account it went into, or "none"'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      move_to: z.enum(['personal', 'friends', 'group']).optional().describe('Where the expense should live; with "friends" give split_with, with "group" give group'),
      split_with: z.array(z.string()).optional(),
      group: z.string().optional(),
      paid_by: z.string().optional().describe('"me" or a friend’s name'),
      split: z.enum(['equal', 'they_owe_all', 'exact']).optional(),
      shares: z.array(z.object({ name: z.string().describe('"me" or a friend’s name'), amount: z.number().positive() })).optional().describe('For split = exact: rupees per person, must add up to the amount'),
    },
  }, async (a) => {
    const cur = await currentInput(userId, a.id)
    if (!cur) return fail('Expense not found (or deleted — restore it first).')
    const ctx = await loadContext(userId)
    const friends = friendList(ctx.friends as Named[])
    const input: ExpenseInput = { ...cur.input }
    if (a.amount !== undefined) input.amount = toPaise(a.amount)
    if (a.description !== undefined) input.description = a.description
    if (a.need) input.needLevel = a.need === 'none' ? null : a.need
    if (a.date) input.date = a.date
    if (a.category) input.category = a.category
    if (a.account) {
      if (a.account.toLowerCase() === 'none') input.assetId = null
      else {
        const r = findOne(ctx.accounts, a.account, 'account')
        if (r.error) return fail(r.error)
        input.assetId = r.item!.id
      }
    }
    if (a.payment_method) {
      if (a.payment_method.toLowerCase() === 'none') input.paymentMethodId = null
      else {
        const r = findOne(ctx.methods, a.payment_method, 'payment method')
        if (r.error) return fail(r.error)
        input.paymentMethodId = r.item!.id
      }
    }
    if (a.move_to === 'personal') { input.target = { type: 'personal' }; input.splitMode = 'equal'; input.participants = undefined; input.paidById = userId }
    if (a.move_to === 'group' || (a.group && !a.move_to)) {
      if (!a.group) return fail('Say which group.')
      const r = findOne(ctx.groups, a.group, 'group')
      if (r.error) return fail(r.error)
      input.target = { type: 'group', id: r.item!.id }; input.participants = undefined
    }
    if (a.move_to === 'friends' || (a.split_with && !a.move_to)) {
      if (!a.split_with?.length) return fail('Say who to split with.')
      const ids: string[] = []
      for (const n of a.split_with) { const r = findOne(friends, n, 'friend'); if (r.error) return fail(r.error); ids.push(r.item!.id) }
      input.target = { type: 'friends', ids }; input.participants = undefined
    }
    if (a.paid_by) {
      if (a.paid_by.toLowerCase() === 'me') input.paidById = userId
      else { const r = findOne(friends, a.paid_by, 'friend'); if (r.error) return fail(r.error); input.paidById = r.item!.id }
    }
    if (a.split) input.splitMode = a.split === 'they_owe_all' ? 'full' : a.split
    if (a.shares?.length) {
      input.splitMode = 'exact'
      const splits: { userId: string; amount: number }[] = []
      for (const s of a.shares) {
        let uid = userId
        if (s.name.toLowerCase() !== 'me') { const r = findOne(friends, s.name, 'friend'); if (r.error) return fail(r.error); uid = r.item!.id }
        splits.push({ userId: uid, amount: toPaise(s.amount) })
      }
      input.splits = splits
    } else if (input.splitMode === 'exact' && a.amount !== undefined) {
      input.splitMode = 'equal' // new amount no longer matches the old exact shares
      input.participants = undefined
    }
    try {
      const expense = await saveInput(userId, input, 'mcp', a.id)
      if (!expense.group.isPersonal) notifyExpenseSplitMembers({ prisma, expense, group: expense.group, excludeUserIds: [userId], action: 'edited' }).catch(() => {})
      return text(`Updated: ${ledger.describeExpense(expense).replace(/^✅\s*/, '')} [id ${expense.id}]`)
    } catch (e) {
      return fail(errMsg(e, 'Couldn’t save that change.'))
    }
  })

  server.registerTool('restore_expense', {
    title: 'Restore a deleted expense',
    description: 'Bring back a deleted expense (find ids with search_expenses include_deleted, or the timeline).',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const e = await prisma.expense.findFirst({ where: { id, deletedAt: { not: null }, group: { members: { some: { userId } } } } })
    if (!e) return fail('No deleted expense with that id.')
    await prisma.expense.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
    await prisma.activity.create({ data: { groupId: e.groupId, userId, type: 'expense_restored', metadata: JSON.stringify({ expenseId: id, description: e.description, amount: e.amount, via: 'mcp' }) } })
    return text(`Restored “${e.description}” (${inr(e.amount)}).`)
  })

  /* ---------------- payments ---------------- */

  server.registerTool('delete_payment', {
    title: 'Delete (undo) a recorded payment',
    description: 'Soft-delete a settle-up payment so it stops counting; it can be restored. Confirm with the user first. Ids come from list_transactions / search_expenses ("payment <id>").',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ id }) => {
    const s = await prisma.settlement.findFirst({ where: { id, deletedAt: null, group: { members: { some: { userId } } } } })
    if (!s) return fail('Payment not found.')
    await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } })
    await prisma.activity.create({ data: { groupId: s.groupId, userId, type: 'settlement_deleted', metadata: JSON.stringify({ settlementId: id, fromUserId: s.fromUserId, toUserId: s.toUserId, amount: s.amount, via: 'mcp' }) } })
    notifyPaymentChange({ prisma, actorId: userId, settlement: s, action: 'deleted' }).catch(() => {})
    return text(`Deleted the ${inr(s.amount)} payment. Balances are back to how they were before it.`)
  })

  server.registerTool('restore_payment', {
    title: 'Restore a deleted payment',
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const s = await prisma.settlement.findFirst({ where: { id, deletedAt: { not: null }, group: { members: { some: { userId } } } } })
    if (!s) return fail('No deleted payment with that id.')
    await prisma.settlement.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
    await prisma.activity.create({ data: { groupId: s.groupId, userId, type: 'settlement_restored', metadata: JSON.stringify({ settlementId: id, fromUserId: s.fromUserId, toUserId: s.toUserId, amount: s.amount, via: 'mcp' }) } })
    notifyPaymentChange({ prisma, actorId: userId, settlement: s, action: 'restored' }).catch(() => {})
    return text(`Restored the ${inr(s.amount)} payment.`)
  })

  /* ---------------- timeline & inbox ---------------- */

  server.registerTool('timeline', {
    title: 'Activity timeline',
    description: 'Who added, edited (with before → after), deleted or restored what, and payments — across everything the user shares, newest first.',
    inputSchema: { limit: z.number().int().min(1).max(200).optional().describe('Default 40'), before: z.string().optional().describe('ISO timestamp to page back from') },
    annotations: { readOnlyHint: true },
  }, async ({ limit, before }) => {
    const { items, nextBefore } = await timeline(userId, { take: limit || 40, before: before ? new Date(before) : undefined })
    if (!items.length) return text('Nothing yet.')
    const lines = items.map((h) => `${h.at.slice(0, 16).replace('T', ' ')}  ${h.actor} ${h.verb} ${h.subject}${h.amount != null ? ` · ${inr(h.amount)}` : ''} (${h.where})${h.changes.length ? ' — ' + h.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; ') : ''}${h.target ? ` [${h.target.kind} ${h.target.id}${h.target.deleted ? ', currently deleted' : ''}]` : ''}`)
    return text(lines.join('\n') + (nextBefore ? `\n(more: before=${nextBefore})` : ''))
  })

  server.registerTool('to_sort', {
    title: 'To-sort inbox',
    description: 'Payments captured automatically (bank SMS) or unclear entries that still need a type or a home.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const rows = await prisma.expense.findMany({ where: { createdById: userId, needsReview: true, deletedAt: null }, orderBy: { date: 'desc' }, take: 50, select: { id: true, description: true, amount: true, date: true, payee: true, inputText: true } })
    if (!rows.length) return text('Inbox is empty.')
    return text(rows.map((r) => `${istDay(r.date)}  ${r.description}  ${inr(r.amount)}${r.payee ? ` · payee ${r.payee}` : ''}  [id ${r.id}]`).join('\n'))
  })

  server.registerTool('file_to_sort', {
    title: 'File a To-sort item',
    description: 'Give an inbox item a need level (and optionally a better name) and keep it personal — the payee is remembered for next time. To split it instead, use edit_expense.',
    inputSchema: { id: z.string(), need: z.enum(['essential', 'semi', 'luxury']), description: z.string().max(120).optional() },
  }, async ({ id, need, description }) => {
    try {
      const e = await ledger.moveExpense(prisma, { expenseId: id, userId, groupId: null, needLevel: need, description })
      return text(`Filed: ${ledger.describeExpense(e).replace(/^✅\s*/, '')}`)
    } catch (e) {
      return fail(errMsg(e, 'Couldn’t file that item.'))
    }
  })

  /* ---------------- friends & groups ---------------- */

  server.registerTool('add_friend', {
    title: 'Add a friend',
    description: 'Add a friend by name (they don’t need an account — you get a link to send them) or by FairShare username.',
    inputSchema: { name: z.string().max(40).optional(), username: z.string().optional() },
  }, async ({ name, username }) => {
    if (!name && !username) return fail('Give a name or a username.')
    try {
      const u = await ledger.addFriend(prisma, userId, { name, username })
      const full = await prisma.user.findUnique({ where: { id: u.id }, select: { claimCode: true, isPlaceholder: true } })
      return text(`Added ${u.displayName}.${full?.isPlaceholder && full.claimCode ? ` They’re not on FairShare yet — send them ${SITE.url}/claim/${full.claimCode} to join and see your shared balance.` : ''}`)
    } catch (e) {
      return fail(errMsg(e, 'Couldn’t add that friend.'))
    }
  })

  server.registerTool('create_group', {
    title: 'Create a group',
    description: 'Create a group (flat, trip…) with existing friends and/or new people by name. Returns an invite link.',
    inputSchema: { name: z.string().min(1).max(60), members: z.array(z.string()).optional().describe('Friend names; unknown names are added as new friends') },
  }, async ({ name, members = [] }) => {
    const ctx = await loadContext(userId)
    const friends = friendList(ctx.friends as Named[])
    let inviteCode = generateInviteCode()
    while (await prisma.group.findUnique({ where: { inviteCode } })) inviteCode = generateInviteCode()
    const group = await prisma.group.create({ data: { name: name.trim(), inviteCode, createdById: userId, members: { create: { userId } } } })
    await prisma.activity.create({ data: { groupId: group.id, userId, type: 'group_created', metadata: JSON.stringify({ groupName: group.name }) } })
    const added: string[] = []
    for (const n of members) {
      const r = findOne(friends, n, 'friend')
      const fid = r.item ? r.item.id : (await ledger.addFriend(prisma, userId, { name: n })).id
      await prisma.groupMember.upsert({ where: { groupId_userId: { groupId: group.id, userId: fid } }, update: {}, create: { groupId: group.id, userId: fid } })
      notifyAddedToGroup({ prisma, actorId: userId, userId: fid, group }).catch(() => {})
      added.push(r.item ? r.item.name : `${n} (new)`)
    }
    return text(`Created “${group.name}”${added.length ? ` with ${added.join(', ')}` : ''}. Invite link: ${SITE.url}/join/${inviteCode}`)
  })

  server.registerTool('add_group_member', {
    title: 'Add someone to a group',
    inputSchema: { group: z.string(), person: z.string().describe('A friend’s name, or a new name') },
  }, async ({ group, person }) => {
    const ctx = await loadContext(userId)
    const g = findOne(ctx.groups, group, 'group')
    if (g.error) return fail(g.error)
    const r = findOne(friendList(ctx.friends as Named[]), person, 'friend')
    const fid = r.item ? r.item.id : (await ledger.addFriend(prisma, userId, { name: person })).id
    await prisma.groupMember.upsert({ where: { groupId_userId: { groupId: g.item!.id, userId: fid } }, update: {}, create: { groupId: g.item!.id, userId: fid } })
    await prisma.activity.create({ data: { groupId: g.item!.id, userId, type: 'member_added', metadata: JSON.stringify({ addedUserId: fid }) } })
    notifyAddedToGroup({ prisma, actorId: userId, userId: fid, group: { id: g.item!.id, name: g.item!.name } }).catch(() => {})
    return text(`Added ${r.item ? r.item.name : person} to ${g.item!.name}.`)
  })

  server.registerTool('remove_group_member', {
    title: 'Remove someone from a group',
    description: 'Only allowed when their balance in the group is zero. Only the group creator can remove others; use leave_group to leave yourself.',
    inputSchema: { group: z.string(), person: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ group, person }) => {
    const ctx = await loadContext(userId)
    const g = findOne(ctx.groups, group, 'group')
    if (g.error) return fail(g.error)
    const members = g.item!.members.map((m) => ({ id: m.user.id, name: m.user.displayName }))
    const m = findOne(members.filter((x) => x.id !== userId), person, 'member')
    if (m.error) return fail(m.error)
    const full = await prisma.group.findUnique({ where: { id: g.item!.id }, select: { createdById: true } })
    if (full?.createdById !== userId) return fail('Only the person who created the group can remove members.')
    const gl = await groupLedger(g.item!.id)
    if (gl && (gl.net.get(m.item!.id) || 0) !== 0) return fail(`${m.item!.name} still has a balance of ${inr(Math.abs(gl.net.get(m.item!.id) || 0))} here — settle up first.`)
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId: g.item!.id, userId: m.item!.id } } })
    await prisma.activity.create({ data: { groupId: g.item!.id, userId, type: 'member_removed', metadata: JSON.stringify({ removedUserId: m.item!.id, removedDisplayName: m.item!.name }) } })
    return text(`Removed ${m.item!.name} from ${g.item!.name}.`)
  })

  server.registerTool('leave_group', {
    title: 'Leave a group',
    description: 'Only allowed when your balance in the group is zero.',
    inputSchema: { group: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ group }) => {
    const ctx = await loadContext(userId)
    const g = findOne(ctx.groups, group, 'group')
    if (g.error) return fail(g.error)
    const gl = await groupLedger(g.item!.id)
    if (gl && (gl.net.get(userId) || 0) !== 0) return fail(`You still have a balance of ${inr(Math.abs(gl.net.get(userId) || 0))} in ${g.item!.name} — settle up first.`)
    const count = await prisma.groupMember.count({ where: { groupId: g.item!.id } })
    if (count <= 1) await prisma.group.update({ where: { id: g.item!.id }, data: { deletedAt: new Date() } })
    else {
      await prisma.groupMember.delete({ where: { groupId_userId: { groupId: g.item!.id, userId } } })
      await prisma.activity.create({ data: { groupId: g.item!.id, userId, type: 'member_left' } })
    }
    return text(`You left ${g.item!.name}.`)
  })

  server.registerTool('group_invite_link', {
    title: 'Group invite link',
    inputSchema: { group: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ group }) => {
    const ctx = await loadContext(userId)
    const g = findOne(ctx.groups, group, 'group')
    if (g.error) return fail(g.error)
    const full = await prisma.group.findUnique({ where: { id: g.item!.id }, select: { inviteCode: true } })
    return text(`${SITE.url}/join/${full!.inviteCode}`)
  })

  /* ---------------- payment methods & settings ---------------- */

  server.registerTool('manage_payment_method', {
    title: 'Manage payment methods',
    description: 'add / rename / hide / unhide a payment method, or set_default — the one assumed when no method is said.',
    inputSchema: {
      action: z.enum(['add', 'rename', 'hide', 'unhide', 'set_default']),
      name: z.string().min(1).max(30),
      new_name: z.string().max(30).optional().describe('For rename'),
      kind: z.enum(['upi', 'card', 'cash', 'bank', 'other']).optional().describe('For add'),
    },
  }, async ({ action, name, new_name, kind }) => {
    const all = await ledger.listPaymentMethods(prisma, userId, { includeArchived: true }) as { id: string; name: string; archivedAt: Date | null }[]
    if (action === 'add') {
      const dupe = all.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
      if (dupe) { await prisma.paymentMethod.update({ where: { id: dupe.id }, data: { archivedAt: null } }); return text(`${dupe.name} is available again.`) }
      await prisma.paymentMethod.create({ data: { userId, name: name.trim(), kind: kind || 'other', sortOrder: all.length } })
      return text(`Added payment method ${name.trim()}.`)
    }
    const r = findOne(all.map((m) => ({ ...m })), name, 'payment method')
    if (r.error) return fail(r.error)
    const m = r.item!
    if (action === 'rename') {
      if (!new_name?.trim()) return fail('Give the new name.')
      await prisma.paymentMethod.update({ where: { id: m.id }, data: { name: new_name.trim() } })
      return text(`Renamed ${m.name} to ${new_name.trim()}.`)
    }
    if (action === 'hide' || action === 'unhide') {
      await prisma.paymentMethod.update({ where: { id: m.id }, data: { archivedAt: action === 'hide' ? new Date() : null } })
      return text(`${m.name} is ${action === 'hide' ? 'hidden' : 'visible again'}.`)
    }
    await prisma.user.update({ where: { id: userId }, data: { defaultMethodId: m.id } })
    return text(`${m.name} is now the default when no payment method is said.`)
  })

  server.registerTool('update_settings', {
    title: 'Update profile & AI settings',
    description: 'Display name, UPI ID (for one-tap “Pay” buttons), and the user’s own rules for how the AI reads Siri / typed entries.',
    inputSchema: {
      display_name: z.string().min(1).max(40).optional(),
      upi_id: z.string().optional().describe('name@bank, or "" to remove'),
      ai_instructions: z.string().max(2000).optional().describe('Replaces the current rules; "" clears them'),
    },
  }, async ({ display_name, upi_id, ai_instructions }) => {
    const data: { displayName?: string; upiId?: string | null; aiInstructions?: string | null } = {}
    if (display_name) data.displayName = display_name.trim()
    if (upi_id !== undefined) {
      const v = upi_id.trim()
      if (v && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v)) return fail('That doesn’t look like a UPI ID (name@bank).')
      data.upiId = v || null
    }
    if (ai_instructions !== undefined) data.aiInstructions = ai_instructions.trim() || null
    if (!Object.keys(data).length) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, upiId: true, aiInstructions: true } })
      return text(`Name: ${u?.displayName}\nUPI ID: ${u?.upiId || '—'}\nAI rules: ${u?.aiInstructions || '—'}`)
    }
    await prisma.user.update({ where: { id: userId }, data })
    return text(`Saved: ${Object.keys(data).join(', ')}.`)
  })

  /* ---------- Net worth ---------- */

  server.registerTool('net_worth', {
    title: 'Net worth and accounts',
    description: 'The user’s net worth: every account (bank, mutual fund, stocks, FD, PPF, EPF, NPS, gold, loans…) with money put in, current value and returns, plus the total and change this month. Call this before update_accounts to see existing account names.',
    inputSchema: { include_archived: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ include_archived }) => {
    const nw = await netWorth(userId, { includeArchived: include_archived })
    if (!nw.accounts.length) return text('No accounts yet. Use update_accounts with names, kinds and values to create them.')
    const pct = (v: number | null) => (v === null ? '' : ` (${v >= 0 ? '+' : ''}${v.toFixed(1)}%)`)
    return text([
      `Net worth: ${inr(nw.total)}${nw.loans ? ` (${inr(nw.assets)} assets − ${inr(nw.loans)} loans)` : ''}`,
      `Put in: ${inr(nw.invested)} · returns ${nw.gain >= 0 ? '+' : '−'}${inr(Math.abs(nw.gain))}${pct(nw.gainPct)}`,
      nw.changeThisMonth !== null ? `Change this month: ${nw.changeThisMonth >= 0 ? '+' : '−'}${inr(Math.abs(nw.changeThisMonth))}` : '',
      `Last updated: ${nw.lastUpdate ? istDay(nw.lastUpdate) : 'never'}`,
      '',
      ...nw.accounts.map((a) => `${a.name} — ${kindMeta(a.kind).label}${a.archived ? ' [archived]' : ''}: ${a.isLoan ? `owes ${inr(a.value)}` : `worth ${inr(a.value)}, put in ${inr(a.invested)}${pct(a.gainPct)}`}${a.updatedAt ? `, as of ${istDay(a.updatedAt)}` : ''}${a.addedSince ? ` (+${inr(a.addedSince)} logged since)` : ''}  [id ${a.id}]`),
    ].filter((l) => l !== null).join('\n'))
  })

  server.registerTool('update_accounts', {
    title: 'Update account values (e.g. from a screenshot)',
    description: 'Record current values for one or more accounts in one go — ideal when the user shares a screenshot of a portfolio, bank or PF statement. Accounts are matched by name (case-insensitive, partial ok); unknown names are created with the given kind. Omit invested or value to keep the current number. For a loan, value is what is still owed. Show the user what you will record before calling if the screenshot was unclear.',
    inputSchema: {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('As-of date, YYYY-MM-DD; defaults to today'),
      accounts: z.array(z.object({
        name: z.string().min(1).max(60).describe('Account name, e.g. "Axis Bluechip Fund", "HDFC savings", "PPF"'),
        kind: z.enum(ASSET_KIND_KEYS as [string, ...string[]]).optional().describe('Only used when creating a new account'),
        invested: z.number().nonnegative().optional().describe('Total money put in so far (principal), rupees'),
        value: z.number().nonnegative().optional().describe('What it is worth now (or still owed, for a loan), rupees'),
        note: z.string().max(200).optional(),
      })).min(1).max(50),
    },
  }, async ({ date, accounts }) => {
    try {
      const d = date || istDay(new Date())
      const res = await recordValues(userId, new Date(`${d}T00:00:00+05:30`), accounts.map((a) => ({
        name: a.name, kind: a.kind, note: a.note,
        invested: a.invested !== undefined ? toPaise(a.invested) : undefined,
        value: a.value !== undefined ? toPaise(a.value) : undefined,
      })), 'mcp')
      const nw = await netWorth(userId)
      return text([
        `Recorded as of ${d}:`,
        ...res.map((r) => `${r.created ? '＋ new ' : ''}${r.name}: value ${inr(r.before.value)} → ${inr(r.after.value)}, put in ${inr(r.before.invested)} → ${inr(r.after.invested)}`),
        `Net worth now ${inr(nw.total)}.`,
      ].join('\n'))
    } catch (e) {
      return fail(errMsg(e, 'Couldn’t record those values.'))
    }
  })

  server.registerTool('account_history', {
    title: 'One account’s history',
    description: 'Every recorded update and every logged investment for one account.',
    inputSchema: { account: z.string().describe('Account name or id') },
    annotations: { readOnlyHint: true },
  }, async ({ account }) => {
    const all = await prisma.asset.findMany({ where: { userId }, select: { id: true, name: true } })
    const hit = all.find((x) => x.id === account) || findOne(all, account, 'account').item
    if (!hit) return fail(findOne(all, account, 'account').error || 'Account not found')
    const d = (await accountDetail(userId, hit.id))!
    const rows = [
      ...d.asset.snapshots.map((s) => ({ t: s.date, line: `${istDay(s.date)}  update: worth ${inr(s.value)}, put in ${inr(s.invested)}${s.source !== 'manual' ? ` (via ${s.source})` : ''}${s.note ? ` — ${s.note}` : ''}  [snapshot ${s.id}]` })),
      ...d.asset.expenses.map((e) => ({ t: e.date, line: `${istDay(e.date)}  invested ${inr(e.amount)} — ${e.description}  [expense ${e.id}]` })),
    ].sort((a, b) => b.t.getTime() - a.t.getTime())
    return text([`${d.asset.name} (${kindMeta(d.asset.kind).label}): worth ${inr(d.position.value)}, put in ${inr(d.position.invested)}`, ...rows.map((r) => r.line)].join('\n'))
  })

  server.registerTool('manage_account', {
    title: 'Rename, re-type, archive or fix an account',
    description: 'Rename an account, change its kind, archive / unarchive it (archived accounts leave the net worth), or delete a mistaken update by snapshot id (from account_history).',
    inputSchema: {
      account: z.string().optional().describe('Account name or id'),
      action: z.enum(['rename', 'set_kind', 'archive', 'unarchive', 'delete_snapshot']),
      new_name: z.string().min(1).max(60).optional(),
      kind: z.enum(ASSET_KIND_KEYS as [string, ...string[]]).optional(),
      snapshot_id: z.string().optional(),
    },
  }, async (a) => {
    if (a.action === 'delete_snapshot') {
      if (!a.snapshot_id) return fail('Give snapshot_id.')
      const s = await prisma.assetSnapshot.findFirst({ where: { id: a.snapshot_id, asset: { userId } }, include: { asset: { select: { name: true } } } })
      if (!s) return fail('Snapshot not found.')
      await prisma.assetSnapshot.delete({ where: { id: s.id } })
      return text(`Deleted the ${istDay(s.date)} update of ${s.asset.name}.`)
    }
    if (!a.account) return fail('Give account.')
    const all = await prisma.asset.findMany({ where: { userId }, select: { id: true, name: true } })
    const r = all.find((x) => x.id === a.account) ? { item: all.find((x) => x.id === a.account) } : findOne(all, a.account, 'account')
    if (!r.item) return fail(r.error || 'Account not found')
    const data: { name?: string; kind?: string; archivedAt?: Date | null } = {}
    if (a.action === 'rename') { if (!a.new_name) return fail('Give new_name.'); data.name = a.new_name.trim() }
    if (a.action === 'set_kind') { if (!a.kind) return fail('Give kind.'); data.kind = a.kind }
    if (a.action === 'archive') data.archivedAt = new Date()
    if (a.action === 'unarchive') data.archivedAt = null
    await prisma.asset.update({ where: { id: r.item.id }, data })
    return text(`Done: ${r.item.name} — ${a.action.replace('_', ' ')}${data.name ? ` → ${data.name}` : ''}${data.kind ? ` → ${data.kind}` : ''}.`)
  })
}
