function formatAmount(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function sendTelegramUserNotification({ prisma, userId, message }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return { userId, sent: false, reason: 'telegram_token_missing' };
  }

  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { telegramId: true },
  });

  if (!link?.telegramId) {
    return { userId, sent: false, reason: 'telegram_not_linked' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: link.telegramId,
        text: message,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Telegram notification failed:', response.status, body);
      return { userId, sent: false, reason: 'telegram_api_error' };
    }

    return { userId, sent: true };
  } catch (error) {
    console.error('Telegram notification error:', error);
    return { userId, sent: false, reason: 'telegram_request_failed' };
  }
}

function looksLikeCuid(value) {
  return typeof value === 'string' && /^c[a-z0-9]{20,}$/i.test(value);
}

async function resolveUserDisplayName({ prisma, userId, user }) {
  const candidate = user?.displayName || user?.username;

  if (candidate && !looksLikeCuid(candidate)) {
    return candidate;
  }

  if (!userId) {
    return candidate || 'Someone';
  }

  const resolved = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true },
  });

  return resolved?.displayName || resolved?.username || 'Someone';
}

function formatExpenseParticipantMessage({ expense, group, split, paidByName }) {
  return [
    '💸 New FairShare expense',
    `${paidByName} added ${expense.description} - ${formatAmount(expense.amount)}`,
    `Group: ${group.name}`,
    `Your share: ${formatAmount(split.amount)}`,
  ].join('\n');
}

async function notifyExpenseSplitMembers({ prisma, expense, group, excludeUserIds }) {
  const excluded = new Set((excludeUserIds || []).filter(Boolean));
  const splits = (expense.splits || []).filter((split) => !excluded.has(split.userId));
  const paidByName = await resolveUserDisplayName({
    prisma,
    userId: expense.paidById || expense.paidBy?.id,
    user: expense.paidBy,
  });

  const results = [];

  for (const split of splits) {
    const message = formatExpenseParticipantMessage({ expense, group, split, paidByName });
    results.push(await sendTelegramUserNotification({ prisma, userId: split.userId, message }));
  }

  return {
    attempted: results.length,
    sent: results.filter((result) => result.sent).length,
    skipped: results.filter((result) => !result.sent),
    results,
  };
}

module.exports = {
  formatExpenseParticipantMessage,
  notifyExpenseSplitMembers,
  resolveUserDisplayName,
  sendTelegramUserNotification,
};
