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
    where: { deletedAt: null, isPersonal: false, members: { some: { userId } } },
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

async function createExpense(prisma, {
  userId, group, description, amount, category, date, source = 'web', payee = null,
  externalRef = null, needsReview = false, rawText = null, paidById,
}) {
  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id }, orderBy: { joinedAt: 'asc' }, select: { userId: true },
  });
  if (!members.length) throw new LedgerError('Group has no members', 400, 'EMPTY_GROUP');
  const payer = paidById || userId;
  // put payer first so any paisa remainder lands on them
  const ids = [payer, ...members.map((m) => m.userId).filter((id) => id !== payer)];
  const splits = equalSplits(amount, members.some((m) => m.userId === payer) ? ids : members.map((m) => m.userId));

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId: group.id,
        description,
        amount,
        category: category || guessCategory(description),
        date: date || new Date(),
        paidById: payer,
        createdById: userId,
        source,
        payee,
        externalRef,
        needsReview,
        splits: { create: splits },
      },
      include: {
        group: { select: { id: true, name: true, isPersonal: true } },
        paidBy: { select: { id: true, displayName: true } },
        splits: { include: { user: { select: { id: true, displayName: true } } } },
      },
    });
    await tx.activity.create({
      data: {
        groupId: group.id, userId, type: 'expense_added',
        metadata: JSON.stringify({ expenseId: expense.id, description, amount, source, rawText }),
      },
    });
    return expense;
  });
}

function describeExpense(expense) {
  if (expense.group.isPersonal) {
    return `✅ ${expense.description} — ${formatINR(expense.amount)} · personal · ${expense.category}`;
  }
  const n = expense.splits.length;
  const mine = expense.splits.find((s) => s.userId === expense.paidById);
  return `✅ ${expense.description} — ${formatINR(expense.amount)} · ${expense.group.name} (÷${n}, your share ${formatINR(mine ? mine.amount : 0)})`;
}

/** "milk 20", "dinner 1200 @flat", "20 chai #me" */
async function addFromText(prisma, { userId, text, source = 'web', groupId, groupName, category, date }) {
  const parsed = parseQuickText(text);
  if (parsed.error) throw new LedgerError(parsed.error, 400, parsed.code);
  const group = await resolveTarget(prisma, { userId, groupId, groupName, tag: parsed.tag });
  const expense = await createExpense(prisma, {
    userId, group, description: parsed.description, amount: parsed.amount,
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
  const expense = await createExpense(prisma, {
    userId, group, description, amount: parsed.amount,
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
async function moveExpense(prisma, { expenseId, userId, groupId, description, category, confirm = true }) {
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
        needsReview: confirm ? false : expense.needsReview,
        splits: { create: equalSplits(expense.amount, splitIds) },
      },
      include: {
        group: { select: { id: true, name: true, isPersonal: true } },
        paidBy: { select: { id: true, displayName: true } },
        splits: { include: { user: { select: { id: true, displayName: true } } } },
      },
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
      id: true, name: true,
      members: { select: { user: { select: { id: true, displayName: true, upiId: true } } } },
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
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return Array.from(friends.values())
    .map((f) => ({ ...f, groups: Object.entries(f.byGroup).filter(([, v]) => v !== 0).map(([id, v]) => ({ id, name: groupNames[id], net: v })) }))
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

function upiLink({ vpa, name, amount, note = 'FairShare settle up' }) {
  if (!vpa) return null;
  const q = new URLSearchParams({ pa: vpa, pn: name || vpa, cu: 'INR', tn: note });
  if (amount) q.set('am', (amount / 100).toFixed(2));
  return `upi://pay?${q.toString()}`;
}

module.exports = {
  LedgerError,
  PERSONAL_TAGS,
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
