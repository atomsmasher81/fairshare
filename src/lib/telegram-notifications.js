function formatAmount(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function telegramCall(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      console.error('Telegram call failed:', method, res.status, json?.description);
      return null;
    }
    return json.result;
  } catch (e) {
    console.error('Telegram call error:', e);
    return null;
  }
}

function reviewKeyboard(expense, groups) {
  const rows = [];
  const row1 = [{ text: '🙋 Personal', callback_data: `rv:${expense.id}:p` }];
  for (const g of groups.slice(0, 3)) row1.push({ text: `👥 ${g.name}`.slice(0, 30), callback_data: `rv:${expense.id}:${g.id}` });
  rows.push(row1);
  for (const g of groups.slice(3, 9)) rows.push([{ text: `👥 ${g.name}`.slice(0, 30), callback_data: `rv:${expense.id}:${g.id}` }]);
  rows.push([{ text: '🗑 Not an expense', callback_data: `rv:${expense.id}:x` }]);
  return { inline_keyboard: rows };
}

/** Ask the user where an auto-captured payment belongs. Reply to the message to rename it. */
async function sendReviewPrompt({ prisma, userId, expense }) {
  const link = await prisma.telegramLink.findUnique({ where: { userId }, select: { telegramId: true } });
  if (!link?.telegramId) return { sent: false, reason: 'telegram_not_linked' };
  const groups = await prisma.group.findMany({
    where: { deletedAt: null, isPersonal: false, members: { some: { userId } } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const text = [
    `💸 ${formatAmount(expense.amount)} → ${expense.description}`,
    `Saved as personal · ${expense.category}`,
    '',
    'Tap where it belongs. Reply to this message to rename it (e.g. "groceries").',
  ].join('\n');
  const msg = await telegramCall('sendMessage', {
    chat_id: link.telegramId,
    text,
    reply_markup: reviewKeyboard(expense, groups),
  });
  if (msg?.message_id) {
    await prisma.expense.update({ where: { id: expense.id }, data: { reviewMsgId: String(msg.message_id) } });
    return { sent: true };
  }
  return { sent: false, reason: 'telegram_api_error' };
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
  reviewKeyboard,
  sendReviewPrompt,
  telegramCall,
  formatExpenseParticipantMessage,
  notifyExpenseSplitMembers,
  resolveUserDisplayName,
  sendTelegramUserNotification,
};
