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
    where: { deletedAt: null, isPersonal: false, isDirect: false, members: { some: { userId } } },
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

function formatINR(paise) {
  const n = paise / 100;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

const VERB = { added: 'added', edited: 'edited', deleted: 'deleted' };

/**
 * What this expense means for one person, in their words.
 * { title, body, text } — title/body for push, text for Telegram.
 */
function describeFor({ expense, group, recipientId, actorName, payerName, action }) {
  const share = (expense.splits || []).find((s) => s.userId === recipientId)?.amount || 0;
  const paidByRecipient = expense.paidById === recipientId;
  const where = group.isDirect ? '' : ` in ${group.name}`;
  const payer = payerName.split(' ')[0];
  let impact;
  if (action === 'deleted') impact = 'no longer counts toward your balance';
  else if (paidByRecipient) impact = `you paid · you're owed ${formatINR(expense.amount - share)}`;
  else impact = `${payer} paid · your share ${formatINR(share)}`;
  const title = `${actorName.split(' ')[0]} ${VERB[action] || 'added'} “${expense.description}”${where}`;
  const body = `${formatINR(expense.amount)} — ${impact}`;
  return { title, body, text: `💸 ${title}\n${body}` };
}

/**
 * Tell everyone involved in an expense (split members + payer), except whoever made the change.
 * Sends a push to their installed app and a Telegram message if they've linked it.
 */
async function notifyExpenseSplitMembers({ prisma, expense, group, excludeUserIds, action = 'added' }) {
  const { pushToUser } = require('./push');
  const excluded = new Set((excludeUserIds || []).filter(Boolean));
  const actorId = (excludeUserIds || [])[0] || expense.createdById;
  const recipients = Array.from(new Set([...(expense.splits || []).map((s) => s.userId), expense.paidById]))
    .filter((id) => id && !excluded.has(id));
  if (!recipients.length) return { attempted: 0, sent: 0 };

  const actorName = await resolveUserDisplayName({ prisma, userId: actorId });
  const payerName = await resolveUserDisplayName({ prisma, userId: expense.paidById || expense.paidBy?.id, user: expense.paidBy });

  let sent = 0;
  for (const userId of recipients) {
    const msg = describeFor({ expense, group, recipientId: userId, actorName, payerName, action });
    const [tg, push] = await Promise.all([
      sendTelegramUserNotification({ prisma, userId, message: msg.text }),
      pushToUser(prisma, userId, {
        title: msg.title,
        body: msg.body,
        url: action === 'deleted' ? '/activity' : `/expense/${expense.id}`,
        tag: `expense-${expense.id}`,
      }),
    ]);
    if (tg.sent || push.sent) sent++;
  }
  return { attempted: recipients.length, sent };
}

/** Tell the other side of a payment that it was recorded. */
async function notifyPayment({ prisma, actorId, fromUserId, toUserId, amount }) {
  const { pushToUser } = require('./push');
  const recipient = actorId === fromUserId ? toUserId : fromUserId;
  if (!recipient || recipient === actorId) return;
  const actorName = (await resolveUserDisplayName({ prisma, userId: actorId })).split(' ')[0];
  const title = actorId === fromUserId ? `${actorName} paid you ${formatINR(amount)}` : `${actorName} recorded your payment of ${formatINR(amount)}`;
  const body = 'Settled up in FairShare — tap to see your balance.';
  await Promise.all([
    sendTelegramUserNotification({ prisma, userId: recipient, message: `✅ ${title}` }),
    pushToUser(prisma, recipient, { title, body, url: `/friends/${actorId}`, tag: `payment-${actorId}` }),
  ]);
}

/** You were added to a group. */
async function notifyAddedToGroup({ prisma, actorId, userId, group }) {
  const { pushToUser } = require('./push');
  if (userId === actorId) return;
  const actorName = (await resolveUserDisplayName({ prisma, userId: actorId })).split(' ')[0];
  const title = `${actorName} added you to ${group.name}`;
  await Promise.all([
    sendTelegramUserNotification({ prisma, userId, message: `👥 ${title}` }),
    pushToUser(prisma, userId, { title, body: 'Split expenses with the group in FairShare.', url: `/groups/${group.id}`, tag: `group-${group.id}` }),
  ]);
}

module.exports = {
  reviewKeyboard,
  sendReviewPrompt,
  telegramCall,
  describeFor,
  notifyExpenseSplitMembers,
  notifyPayment,
  notifyAddedToGroup,
  resolveUserDisplayName,
  sendTelegramUserNotification,
};
