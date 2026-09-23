const DEFAULT_CATEGORY = 'other';

class QuickExpenseError extends Error {
  constructor(message, status = 400, code = 'QUICK_EXPENSE_ERROR') {
    super(message);
    this.name = 'QuickExpenseError';
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

function formatAmount(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function parseAmount(str) {
  const normalized = String(str).replace(/,/g, '');

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }

  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function parseQuickExpenseText(text) {
  if (typeof text !== 'string') {
    throw new QuickExpenseError('Text is required', 400, 'TEXT_REQUIRED');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new QuickExpenseError('Text is required', 400, 'TEXT_REQUIRED');
  }

  if (trimmed.startsWith('/')) {
    throw new QuickExpenseError('Commands are not expense entries', 400, 'COMMAND_IGNORED');
  }

  const match = trimmed.match(/^(.+)\s+(\d[\d,]*(?:\.\d{1,2})?)$/);
  if (!match) {
    throw new QuickExpenseError("Didn't understand. Use: milk 20, super grocery 200, or rent 30,390", 400, 'INVALID_FORMAT');
  }

  const description = match[1].trim();
  const amount = parseAmount(match[2]);

  if (!description) {
    throw new QuickExpenseError('Description is required', 400, 'DESCRIPTION_REQUIRED');
  }

  if (amount <= 0) {
    throw new QuickExpenseError('Amount must be greater than 0', 400, 'INVALID_AMOUNT');
  }

  return { description, amount, rawText: trimmed };
}

async function resolveQuickExpenseGroup({ prisma, userId, groupId, groupName }) {
  if (!userId) {
    throw new QuickExpenseError('userId is required', 400, 'USER_REQUIRED');
  }

  if (groupId) {
    return groupId;
  }

  if (groupName) {
    const group = await prisma.group.findFirst({
      where: {
        name: String(groupName),
        deletedAt: null,
        members: { some: { userId } },
      },
      select: { id: true },
    });

    if (!group) {
      throw new QuickExpenseError('Group not found for this user', 404, 'GROUP_NOT_FOUND');
    }

    return group.id;
  }

  const memberships = await prisma.groupMember.findMany({
    where: {
      userId,
      group: { deletedAt: null },
    },
    select: { groupId: true },
  });

  if (memberships.length === 1) {
    return memberships[0].groupId;
  }

  throw new QuickExpenseError('groupId or groupName is required when the user has multiple/no groups', 400, 'GROUP_REQUIRED');
}

async function createQuickExpenseFromText({ prisma, userId, groupId, text, source = 'api', category = DEFAULT_CATEGORY, date = new Date() }) {
  const { description, amount, rawText } = parseQuickExpenseText(text);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });

  if (!user) {
    throw new QuickExpenseError('User not found', 404, 'USER_NOT_FOUND');
  }

  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      deletedAt: null,
      members: { some: { userId } },
    },
    select: { id: true, name: true },
  });

  if (!group) {
    throw new QuickExpenseError('Group not found or user is not a member', 404, 'GROUP_NOT_FOUND');
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  if (members.length === 0) {
    throw new QuickExpenseError('Group has no members', 400, 'EMPTY_GROUP');
  }

  const splitAmount = Math.floor(amount / members.length);
  const remainder = amount - splitAmount * members.length;
  const expenseDate = date instanceof Date ? date : new Date(date || Date.now());

  if (Number.isNaN(expenseDate.getTime())) {
    throw new QuickExpenseError('Invalid date', 400, 'INVALID_DATE');
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        groupId: group.id,
        description,
        amount,
        category: category || DEFAULT_CATEGORY,
        date: expenseDate,
        paidById: user.id,
        createdById: user.id,
        splits: {
          create: members.map((member, index) => ({
            userId: member.userId,
            amount: splitAmount + (index === 0 ? remainder : 0),
          })),
        },
      },
      include: {
        paidBy: { select: { id: true, displayName: true } },
        splits: { include: { user: { select: { id: true, displayName: true } } } },
      },
    });

    await tx.activity.create({
      data: {
        groupId: group.id,
        userId: user.id,
        type: 'expense_added',
        metadata: JSON.stringify({
          expenseId: created.id,
          description,
          amount,
          source,
          rawText,
        }),
      },
    });

    return created;
  });

  const splitInfo = members.map((member) => member.user.displayName).join(', ');
  const message =
    `✅ Added ${description} - ${formatAmount(amount)}\n` +
    `Group: ${group.name}\n` +
    `Split between: ${splitInfo}\n` +
    `(${formatAmount(splitAmount)} each${remainder ? `, ${formatAmount(remainder)} remainder assigned to ${members[0].user.displayName}` : ''})`;

  return {
    expense,
    group,
    user,
    members,
    description,
    amount,
    splitAmount,
    remainder,
    splitInfo,
    message,
  };
}

module.exports = {
  QuickExpenseError,
  createQuickExpenseFromText,
  formatAmount,
  parseQuickExpenseText,
  resolveQuickExpenseGroup,
};
