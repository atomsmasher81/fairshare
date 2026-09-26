// Core ledger logic shared by the web app, Telegram bot and capture APIs.
const crypto = require('crypto');
const { parseQuickText, parseBankMessage, payeeKey, prettyPayee, guessCategory } = require('./parse');

class LedgerError extends Error {
  constructor(message, status = 400, code = 'LEDGER_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

const PERSONAL_TAGS = new Set(['me', 'personal', 'p', 'self', 'mine', 'solo']);
const NEED_LEVELS = ['essential', 'semi', 'luxury'];
const NEED_LABELS = { essential: 'Essential', semi: 'Semi-essential', luxury: 'Luxury' };
const DEFAULT_METHODS = [
  { name: 'PhonePe', kind: 'upi' },
  { name: 'Google Pay', kind: 'upi' },
  { name: 'Credit card', kind: 'card' },
  { name: 'Cash', kind: 'cash' },
];

function formatINR(paise) {
  const n = paise / 100;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return 'fs_' + crypto.randomBytes(24).toString('base64url');
}

async function getOrCreatePersonalGroup(prisma, userId) {
  const existing = await prisma.group.findFirst({
    where: { isPersonal: true, createdById: userId, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.group.create({
    data: {
      name: 'Personal',
      isPersonal: true,
      inviteCode: 'P' + crypto.randomBytes(6).toString('hex').toUpperCase(),
      createdById: userId,
      members: { create: { userId } },
    },
  });
}

async function listSharedGroups(prisma, userId) {
  return prisma.group.findMany({
    where: { deletedAt: null, isPersonal: false, isDirect: false, members: { some: { userId } } },
    include: { members: { include: { user: { select: { id: true, displayName: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Decide which ledger an entry goes to.
 * Priority: explicit groupId > explicit groupName > #tag > user's default > personal
 */
async function resolveTarget(prisma, { userId, groupId, groupName, tag }) {
  const findShared = async (where) => prisma.group.findFirst({
    where: { ...where, deletedAt: null, members: { some: { userId } } },
  });

  if (groupId) {
    const g = await findShared({ id: groupId });
    if (!g) throw new LedgerError('Group not found for this user', 404, 'GROUP_NOT_FOUND');
    return g;
  }
  const hint = (groupName || tag || '').toString().trim().toLowerCase();
  if (hint) {
    if (PERSONAL_TAGS.has(hint)) return getOrCreatePersonalGroup(prisma, userId);
    const groups = await listSharedGroups(prisma, userId);
    const g = groups.find((x) => x.name.toLowerCase() === hint)
      || groups.find((x) => x.name.toLowerCase().replace(/\s+/g, '').startsWith(hint.replace(/\s+/g, '')));
    if (!g) {
      const names = groups.map((x) => '@' + x.name.toLowerCase().replace(/\s+/g, '')).join(', ');
      throw new LedgerError(`No group matching "${hint}". Try ${names || '#me'} or #me`, 404, 'GROUP_NOT_FOUND');
    }
    return g;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { defaultGroupId: true } });
  if (user?.defaultGroupId) {
    const g = await findShared({ id: user.defaultGroupId });
    if (g) return g;
  }
  return getOrCreatePersonalGroup(prisma, userId);
}

function equalSplits(amount, userIds) {
  const each = Math.floor(amount / userIds.length);
  const rem = amount - each * userIds.length;
  return userIds.map((uid, i) => ({ userId: uid, amount: each + (i === 0 ? rem : 0) }));
}

/**
 * Validate explicit splits against the group, or split equally among all members.
 * Returns [{ userId, amount }] summing exactly to `amount`.
 */
async function resolveSplits(prisma, { group, amount, payer, splits }) {
  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id }, orderBy: { joinedAt: 'asc' }, select: { userId: true },
  });
  if (!members.length) throw new LedgerError('Group has no members', 400, 'EMPTY_GROUP');
  const memberIds = new Set(members.map((m) => m.userId));
  if (!memberIds.has(payer)) throw new LedgerError('Payer must be in the group', 400, 'BAD_PAYER');

  if (Array.isArray(splits) && splits.length) {
    const clean = splits
      .map((x) => ({ userId: String(x.userId), amount: Math.round(Number(x.amount) || 0) }))
      .filter((x) => x.amount > 0);
    const seen = new Set();
    for (const x of clean) {
      if (!memberIds.has(x.userId)) throw new LedgerError('Everyone in the split must be in the group', 400, 'BAD_SPLIT');
      if (seen.has(x.userId)) throw new LedgerError('Duplicate person in split', 400, 'BAD_SPLIT');
      seen.add(x.userId);
    }
    const sum = clean.reduce((a, x) => a + x.amount, 0);
    if (!clean.length || sum !== amount) {
      throw new LedgerError(`Split adds up to ${formatINR(sum)}, not ${formatINR(amount)}`, 400, 'BAD_SPLIT');
    }
    return clean;
  }
  // put payer first so any paisa remainder lands on them
  const ids = [payer, ...members.map((m) => m.userId).filter((id) => id !== payer)];
  return equalSplits(amount, ids);
}

const EXPENSE_INCLUDE = {
  group: { select: { id: true, name: true, isPersonal: true, isDirect: true } },
  paidBy: { select: { id: true, displayName: true } },
  splits: { include: { user: { select: { id: true, displayName: true } } } },
  paymentMethod: { select: { id: true, name: true } },
};

async function createExpense(prisma, {
  userId, group, description, amount, category, date, source = 'web', payee = null,
  externalRef = null, needsReview = false, rawText = null, paidById, splits, splitType,
  needLevel = null, paymentMethodId = null, notes = null,
}) {
  if (!Number.isInteger(amount) || amount <= 0) throw new LedgerError('Amount must be greater than 0', 400, 'INVALID_AMOUNT');
  if (amount > 1e11) throw new LedgerError('That amount looks too large', 400, 'INVALID_AMOUNT');
  const payer = paidById || userId;
  const finalSplits = await resolveSplits(prisma, { group, amount, payer, splits });
  // A payment method only means something when you paid.
  const methodId = payer === userId ? await ownedMethodId(prisma, userId, paymentMethodId) : null;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId: group.id,
        description: String(description || 'Expense').trim().slice(0, 120) || 'Expense',
        amount,
        category: category || guessCategory(description),
        date: date || new Date(),
        paidById: payer,
        createdById: userId,
        source,
        payee,
        externalRef,
        needsReview,
        needLevel: NEED_LEVELS.includes(needLevel) ? needLevel : null,
        paymentMethodId: methodId,
        notes: notes ? String(notes).slice(0, 500) : null,
        splitType: splitType || (splits && splits.length ? 'exact' : 'equal'),
        splits: { create: finalSplits },
      },
      include: EXPENSE_INCLUDE,
    });
    await tx.activity.create({
      data: {
        groupId: group.id, userId, type: 'expense_added',
        metadata: JSON.stringify({ expenseId: expense.id, description: expense.description, amount, source, rawText }),
      },
    });
    return expense;
  });
}

async function ownedMethodId(prisma, userId, id) {
  if (!id) return null;
  const m = await prisma.paymentMethod.findFirst({ where: { id, userId }, select: { id: true } });
  return m ? m.id : null;
}

function describeExpense(expense) {
  if (expense.group.isPersonal) {
    const bits = [NEED_LABELS[expense.needLevel], expense.paymentMethod?.name].filter(Boolean);
    return `✅ ${expense.description} ${formatINR(expense.amount)}${bits.length ? ' · ' + bits.join(' · ') : ''}`;
  }
  const mine = expense.splits.find((s) => s.userId === expense.createdById);
  const others = Array.from(new Set([
    ...expense.splits.filter((s) => s.userId !== expense.createdById).map((s) => s.user?.displayName),
    expense.paidById !== expense.createdById ? expense.paidBy?.displayName : null,
  ].filter(Boolean)));
  const where = expense.group.isDirect ? `with ${others.join(', ')}` : expense.group.name;
  const paidByOther = expense.paidById !== expense.createdById ? ` · ${expense.paidBy?.displayName} paid` : '';
  return `✅ ${expense.description} — ${formatINR(expense.amount)} · ${where}${paidByOther} · your share ${formatINR(mine ? mine.amount : 0)}`;
}

/** "milk 20", "dinner 1200 @flat", "20 chai #me" */
async function addFromText(prisma, { userId, text, source = 'web', groupId, groupName, category, date }) {
  const parsed = parseQuickText(text);
  if (parsed.error) throw new LedgerError(parsed.error, 400, parsed.code);
  const group = await resolveTarget(prisma, { userId, groupId, groupName, tag: parsed.tag });
  const expense = await createExpense(prisma, {
    userId, group, description: parsed.description.charAt(0).toUpperCase() + parsed.description.slice(1), amount: parsed.amount,
    category: category && category !== 'other' ? category : parsed.category,
    date, source, rawText: parsed.rawText,
  });
  return { expense, message: describeExpense(expense) };
}

/**
 * Bank SMS / PhonePe notification text -> expense.
 * Known payee (rule exists) -> filed automatically. Unknown -> personal + needsReview.
 */
async function addFromBankMessage(prisma, { userId, message, source = 'sms', date }) {
  const parsed = parseBankMessage(message);
  if (!parsed) return { skipped: true, reason: 'not_a_debit' };

  if (parsed.ref) {
    const dupe = await prisma.expense.findFirst({
      where: { externalRef: parsed.ref, createdById: userId, deletedAt: null },
    });
    if (dupe) return { skipped: true, reason: 'duplicate', expense: dupe };
  }

  const key = payeeKey(parsed.payee);
  const rule = key ? await prisma.payeeRule.findUnique({ where: { userId_payeeKey: { userId, payeeKey: key } } }) : null;

  let group;
  if (rule?.groupId) {
    group = await prisma.group.findFirst({
      where: { id: rule.groupId, deletedAt: null, members: { some: { userId } } },
    });
  }
  if (!group) group = await getOrCreatePersonalGroup(prisma, userId);

  const description = rule?.description || prettyPayee(parsed.payee);
  const recall = rule ? await recallByDescription(prisma, userId, description) : null;
  const expense = await createExpense(prisma, {
    userId, group, description, amount: parsed.amount,
    needLevel: recall?.needLevel || null,
    paymentMethodId: recall?.paymentMethodId || null,
    category: rule?.category || guessCategory(parsed.payee || ''),
    date: date || new Date(), source, payee: parsed.payee, externalRef: parsed.ref,
    needsReview: !rule, rawText: message,
  });
  return { expense, known: !!rule, message: describeExpense(expense) };
}

async function rememberPayee(prisma, expense) {
  const key = payeeKey(expense.payee);
  if (!key) return;
  const group = expense.group || await prisma.group.findUnique({ where: { id: expense.groupId } });
  await prisma.payeeRule.upsert({
    where: { userId_payeeKey: { userId: expense.createdById, payeeKey: key } },
    update: { description: expense.description, category: expense.category, groupId: group?.isPersonal ? null : expense.groupId },
    create: {
      userId: expense.createdById, payeeKey: key, description: expense.description,
      category: expense.category, groupId: group?.isPersonal ? null : expense.groupId,
    },
  });
}

/** Move an expense to another ledger (personal <-> group), re-splitting equally. */
async function moveExpense(prisma, { expenseId, userId, groupId, description, category, needLevel, confirm = true }) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, deletedAt: null, group: { members: { some: { userId } } } },
  });
  if (!expense) throw new LedgerError('Expense not found', 404, 'NOT_FOUND');
  const target = groupId
    ? await prisma.group.findFirst({ where: { id: groupId, deletedAt: null, members: { some: { userId } } } })
    : await getOrCreatePersonalGroup(prisma, userId);
  if (!target) throw new LedgerError('Group not found', 404, 'GROUP_NOT_FOUND');

  const members = await prisma.groupMember.findMany({ where: { groupId: target.id }, orderBy: { joinedAt: 'asc' } });
  const ids = [expense.paidById, ...members.map((m) => m.userId).filter((id) => id !== expense.paidById)];
  const splitIds = members.some((m) => m.userId === expense.paidById) ? ids : members.map((m) => m.userId);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } });
    const u = await tx.expense.update({
      where: { id: expenseId },
      data: {
        groupId: target.id,
        description: description || expense.description,
        category: category || expense.category,
        needLevel: NEED_LEVELS.includes(needLevel) ? needLevel : expense.needLevel,
        needsReview: confirm ? false : expense.needsReview,
        splits: { create: equalSplits(expense.amount, splitIds) },
      },
      include: EXPENSE_INCLUDE,
    });
    if (target.id !== expense.groupId) {
      await tx.activity.create({
        data: { groupId: target.id, userId, type: 'expense_added', metadata: JSON.stringify({ expenseId, description: u.description, amount: u.amount, movedFrom: expense.groupId }) },
      });
    }
    return u;
  });
  if (confirm) await rememberPayee(prisma, updated);
  return updated;
}

async function undoLast(prisma, userId) {
  const last = await prisma.expense.findFirst({
    where: { createdById: userId, deletedAt: null, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) return null;
  await prisma.expense.update({ where: { id: last.id }, data: { deletedAt: new Date() } });
  await prisma.activity.create({
    data: { groupId: last.groupId, userId, type: 'expense_deleted', metadata: JSON.stringify({ expenseId: last.id, description: last.description }) },
  });
  return last;
}

/**
 * Pairwise balances between `userId` and everyone they share a group with.
 * Positive = they owe you. Negative = you owe them.
 */
async function friendBalances(prisma, userId) {
  const groups = await prisma.group.findMany({
    where: { deletedAt: null, isPersonal: false, members: { some: { userId } } },
    select: {
      id: true, name: true, isDirect: true,
      members: { select: { user: { select: { id: true, displayName: true, upiId: true, isPlaceholder: true, username: true } } } },
      expenses: { where: { deletedAt: null }, select: { paidById: true, splits: { select: { userId: true, amount: true } } } },
      settlements: { select: { fromUserId: true, toUserId: true, amount: true } },
    },
  });
  const friends = new Map();
  const bump = (fid, groupId, delta) => {
    const f = friends.get(fid);
    f.net += delta;
    f.byGroup[groupId] = (f.byGroup[groupId] || 0) + delta;
  };
  for (const g of groups) {
    for (const m of g.members) {
      if (m.user.id !== userId && !friends.has(m.user.id)) {
        friends.set(m.user.id, { user: m.user, net: 0, byGroup: {} });
      }
    }
    for (const e of g.expenses) {
      for (const s of e.splits) {
        if (s.userId === e.paidById) continue;
        if (e.paidById === userId && friends.has(s.userId)) bump(s.userId, g.id, s.amount);
        else if (s.userId === userId && friends.has(e.paidById)) bump(e.paidById, g.id, -s.amount);
      }
    }
    for (const st of g.settlements) {
      if (st.fromUserId === userId && friends.has(st.toUserId)) bump(st.toUserId, g.id, st.amount);
      else if (st.toUserId === userId && friends.has(st.fromUserId)) bump(st.fromUserId, g.id, -st.amount);
    }
  }
  // 1:1 ledger → "Non-group"; ad-hoc ledger with several friends → "with Amit, Rahul"
  const groupNames = Object.fromEntries(groups.map((g) => {
    if (!g.isDirect) return [g.id, g.name];
    const others = g.members.filter((m) => m.user.id !== userId).map((m) => m.user.displayName.split(' ')[0]);
    return [g.id, others.length === 1 ? 'Non-group' : `with ${others.join(', ')}`];
  }));
  const direct = new Set(groups.filter((g) => g.isDirect).map((g) => g.id));
  return Array.from(friends.values())
    .map((f) => ({
      ...f,
      groups: Object.entries(f.byGroup).filter(([, v]) => v !== 0).map(([id, v]) => ({ id, name: groupNames[id], net: v, isDirect: direct.has(id) })),
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/** Your own spending: personal expenses + your share of group expenses. */
async function mySpending(prisma, userId, from, to) {
  const splits = await prisma.expenseSplit.findMany({
    where: {
      userId,
      expense: { deletedAt: null, date: { gte: from, lt: to }, group: { deletedAt: null } },
    },
    select: {
      amount: true,
      expense: {
        select: {
          id: true, description: true, amount: true, category: true, date: true, needsReview: true, source: true,
          paidById: true, groupId: true, group: { select: { name: true, isPersonal: true } },
          paidBy: { select: { displayName: true } },
        },
      },
    },
    orderBy: { expense: { date: 'desc' } },
  });
  const items = splits.map((s) => ({ ...s.expense, share: s.amount, date: s.expense.date.toISOString() }));
  const total = items.reduce((a, i) => a + i.share, 0);
  const byCategory = {};
  for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.share;
  return { items, total, byCategory };
}

/**
 * Hidden ledger for expenses shared with specific people outside any group
 * (Splitwise's "non-group expenses"). One per exact set of members.
 */
async function getOrCreateDirectGroup(prisma, memberIds) {
  const ids = Array.from(new Set(memberIds.map(String))).sort();
  if (ids.length < 2) throw new LedgerError('Pick at least one friend', 400, 'NO_FRIENDS');
  const candidates = await prisma.group.findMany({
    where: { isDirect: true, deletedAt: null, members: { some: { userId: ids[0] } } },
    select: { id: true, members: { select: { userId: true } } },
  });
  const match = candidates.find((g) => g.members.length === ids.length && g.members.every((m) => ids.includes(m.userId)));
  if (match) return prisma.group.findUnique({ where: { id: match.id } });
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  if (users.length !== ids.length) throw new LedgerError('Friend not found', 404, 'FRIEND_NOT_FOUND');
  return prisma.group.create({
    data: {
      name: users.map((u) => u.displayName).join(', ').slice(0, 80),
      isDirect: true,
      inviteCode: 'D' + crypto.randomBytes(6).toString('hex').toUpperCase(),
      createdById: ids[0],
      members: { create: ids.map((userId) => ({ userId })) },
    },
  });
}

/** Everyone you share any ledger with (groups or direct). */
async function listFriends(prisma, userId) {
  const rows = await prisma.groupMember.findMany({
    where: { userId: { not: userId }, group: { deletedAt: null, isPersonal: false, members: { some: { userId } } } },
    select: { user: { select: { id: true, displayName: true, username: true, isPlaceholder: true, upiId: true } } },
  });
  const map = new Map();
  for (const r of rows) map.set(r.user.id, r.user);
  return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Add a friend by username (existing user) or by name (placeholder they can claim later). */
async function addFriend(prisma, userId, { username, name }) {
  if (username) {
    const u = await prisma.user.findUnique({ where: { username: String(username).toLowerCase().replace(/^@/, '') } });
    if (!u || u.isPlaceholder) throw new LedgerError(`No one with username @${username}`, 404, 'FRIEND_NOT_FOUND');
    if (u.id === userId) throw new LedgerError("That's you", 400, 'SELF');
    await getOrCreateDirectGroup(prisma, [userId, u.id]);
    return u;
  }
  const display = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!display) throw new LedgerError('Name is required', 400, 'NAME_REQUIRED');
  const existing = (await listFriends(prisma, userId)).find((f) => f.displayName.toLowerCase() === display.toLowerCase());
  if (existing) return existing;
  const slug = display.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'friend';
  const u = await prisma.user.create({
    data: {
      username: `~${slug}-${crypto.randomBytes(3).toString('hex')}`,
      passwordHash: '',
      displayName: display,
      isPlaceholder: true,
      addedById: userId,
      claimCode: crypto.randomBytes(9).toString('base64url'),
    },
  });
  await getOrCreateDirectGroup(prisma, [userId, u.id]);
  return u;
}

/** Payment methods, creating sensible defaults on first use. */
async function listPaymentMethods(prisma, userId, { includeArchived = false } = {}) {
  let rows = await prisma.paymentMethod.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  if (!rows.length) {
    await prisma.paymentMethod.createMany({ data: DEFAULT_METHODS.map((m, i) => ({ ...m, userId, sortOrder: i })) });
    rows = await prisma.paymentMethod.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }
  return includeArchived ? rows : rows.filter((m) => !m.archivedAt);
}

/**
 * What did this user do last time with a similar description?
 * Lets "milk 20" inherit need level, category and method from the last "milk".
 */
async function recallByDescription(prisma, userId, description) {
  const d = String(description || '').trim();
  if (!d) return null;
  const last = await prisma.expense.findFirst({
    where: { createdById: userId, deletedAt: null, needsReview: false, description: { equals: d } },
    orderBy: { createdAt: 'desc' },
    select: { needLevel: true, category: true, paymentMethodId: true, groupId: true },
  });
  if (last) return last;
  // SQLite equality is case-sensitive; do a cheap case-insensitive pass over recent rows.
  const recent = await prisma.expense.findMany({
    where: { createdById: userId, deletedAt: null, needsReview: false },
    orderBy: { createdAt: 'desc' }, take: 300,
    select: { description: true, needLevel: true, category: true, paymentMethodId: true, groupId: true },
  });
  const lower = d.toLowerCase();
  return recent.find((r) => r.description.toLowerCase() === lower) || null;
}

/** Most recently used payment method — the default for the next entry. */
async function lastUsedMethodId(prisma, userId) {
  const last = await prisma.expense.findFirst({
    where: { createdById: userId, deletedAt: null, paymentMethodId: { not: null } },
    orderBy: { createdAt: 'desc' }, select: { paymentMethodId: true },
  });
  return last?.paymentMethodId || null;
}

/**
 * Record that `fromId` paid `toId`. Spread across the ledgers where `fromId`
 * owes `toId` (largest first); anything beyond existing debt lands in their direct ledger.
 */
async function recordSettlement(prisma, { userId, fromId, toId, amount, date, note, paymentMethodId }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new LedgerError('Amount must be greater than 0', 400, 'INVALID_AMOUNT');
  if (fromId === toId) throw new LedgerError('Cannot settle with yourself', 400, 'SELF');
  if (userId !== fromId && userId !== toId) throw new LedgerError('You can only record your own payments', 403, 'FORBIDDEN');
  const friendId = userId === fromId ? toId : fromId;
  const balances = await friendBalances(prisma, userId);
  const f = balances.find((x) => x.user.id === friendId);
  // net > 0 means friend owes me. fromId owes toId when: (from=friend & net>0) or (from=me & net<0)
  const owingSign = fromId === friendId ? 1 : -1;
  const ledgers = (f ? f.groups : [])
    .filter((g) => Math.sign(g.net) === owingSign)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  let remaining = amount;
  const parts = [];
  for (const g of ledgers) {
    if (remaining <= 0) break;
    const amt = Math.min(remaining, Math.abs(g.net));
    parts.push({ groupId: g.id, amount: amt });
    remaining -= amt;
  }
  if (remaining > 0) {
    const direct = await getOrCreateDirectGroup(prisma, [fromId, toId]);
    const existing = parts.find((p) => p.groupId === direct.id);
    if (existing) existing.amount += remaining;
    else parts.push({ groupId: direct.id, amount: remaining });
  }
  const when = date || new Date();
  const methodId = fromId === userId ? await ownedMethodId(prisma, userId, paymentMethodId) : null;
  return prisma.$transaction(async (tx) => {
    const created = [];
    for (const p of parts) {
      const s = await tx.settlement.create({
        data: { groupId: p.groupId, fromUserId: fromId, toUserId: toId, amount: p.amount, date: when, note: note || null },
      });
      await tx.activity.create({
        data: { groupId: p.groupId, userId, type: 'settlement', metadata: JSON.stringify({ settlementId: s.id, fromUserId: fromId, toUserId: toId, amount: p.amount, paymentMethodId: methodId }) },
      });
      created.push(s);
    }
    return created;
  });
}

/** Move everything a placeholder friend was part of onto a real account. */
async function mergeUsers(prisma, fromId, intoId) {
  if (fromId === intoId) return;
  await prisma.$transaction(async (tx) => {
    const memberships = await tx.groupMember.findMany({ where: { userId: fromId } });
    for (const m of memberships) {
      const exists = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId: m.groupId, userId: intoId } } });
      if (exists) await tx.groupMember.delete({ where: { id: m.id } });
      else await tx.groupMember.update({ where: { id: m.id }, data: { userId: intoId } });
    }
    const splits = await tx.expenseSplit.findMany({ where: { userId: fromId } });
    for (const sp of splits) {
      const clash = await tx.expenseSplit.findUnique({ where: { expenseId_userId: { expenseId: sp.expenseId, userId: intoId } } });
      if (clash) {
        await tx.expenseSplit.update({ where: { id: clash.id }, data: { amount: clash.amount + sp.amount } });
        await tx.expenseSplit.delete({ where: { id: sp.id } });
      } else {
        await tx.expenseSplit.update({ where: { id: sp.id }, data: { userId: intoId } });
      }
    }
    await tx.expense.updateMany({ where: { paidById: fromId }, data: { paidById: intoId } });
    await tx.expense.updateMany({ where: { createdById: fromId }, data: { createdById: intoId } });
    await tx.settlement.updateMany({ where: { fromUserId: fromId }, data: { fromUserId: intoId } });
    await tx.settlement.updateMany({ where: { toUserId: fromId }, data: { toUserId: intoId } });
    await tx.activity.updateMany({ where: { userId: fromId }, data: { userId: intoId } });
    await tx.user.delete({ where: { id: fromId } });
  });
}

function upiLink({ vpa, name, amount, note = 'FairShare settle up' }) {
  if (!vpa) return null;
  const q = new URLSearchParams({ pa: vpa, pn: name || vpa, cu: 'INR', tn: note });
  if (amount) q.set('am', (amount / 100).toFixed(2));
  return `upi://pay?${q.toString()}`;
}

module.exports = {
  LedgerError,
  PERSONAL_TAGS,
  NEED_LEVELS,
  NEED_LABELS,
  EXPENSE_INCLUDE,
  resolveSplits,
  equalSplits,
  getOrCreateDirectGroup,
  recordSettlement,
  mergeUsers,
  listFriends,
  addFriend,
  listPaymentMethods,
  recallByDescription,
  lastUsedMethodId,
  formatINR,
  hashToken,
  newToken,
  getOrCreatePersonalGroup,
  listSharedGroups,
  resolveTarget,
  createExpense,
  describeExpense,
  addFromText,
  addFromBankMessage,
  rememberPayee,
  moveExpense,
  undoLast,
  friendBalances,
  mySpending,
  upiLink,
};
