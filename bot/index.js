require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Bot, InlineKeyboard } = require('grammy');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const ledger = require('../src/lib/ledger');
const { parseBankMessage } = require('../src/lib/parse');
const { notifyExpenseSplitMembers, sendReviewPrompt } = require('../src/lib/telegram-notifications');

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const APP = 'https://split.kartikgautam.com';
const { formatINR } = ledger;

async function getLinkedUser(telegramId) {
  const link = await prisma.telegramLink.findUnique({
    where: { telegramId: String(telegramId) },
    include: { user: true },
  });
  return link?.user || null;
}

async function linkUser(ctx, userId) {
  await prisma.telegramLink.upsert({
    where: { telegramId: String(ctx.from.id) },
    update: { userId, telegramUsername: ctx.from.username },
    create: { telegramId: String(ctx.from.id), telegramUsername: ctx.from.username, userId },
  });
}

async function requireUser(ctx) {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply(`🔗 Link your account first: open ${APP}/settings and tap “Connect Telegram”.`);
    return null;
  }
  return user;
}

async function defaultLabel(user) {
  if (!user.defaultGroupId) return 'Personal';
  const g = await prisma.group.findFirst({ where: { id: user.defaultGroupId, deletedAt: null } });
  return g ? g.name : 'Personal';
}

const HELP = (defaultName) =>
  `*How to add*\n` +
  `\`milk 20\` → goes to *${defaultName}* (your default)\n` +
  `\`dinner 1200 @flat\` → split in a group\n` +
  `\`uber 240 #me\` → personal only\n` +
  `Forward/paste a bank SMS → auto-read, you pick where it goes\n\n` +
  `*Commands*\n` +
  `/balances – who owes whom\n` +
  `/today – today's spend  ·  /month – this month\n` +
  `/review – unsorted auto-captured payments\n` +
  `/undo – delete the last thing you added\n` +
  `/default – change where plain entries go`;

bot.command('start', async (ctx) => {
  const code = (ctx.match || '').trim();
  if (code) {
    const user = await prisma.user.findFirst({ where: { linkCode: code, linkCodeExpires: { gt: new Date() } } });
    if (!user) return ctx.reply('❌ That link has expired. Generate a new one in Settings.');
    await linkUser(ctx, user.id);
    await prisma.user.update({ where: { id: user.id }, data: { linkCode: null, linkCodeExpires: null } });
    return ctx.reply(`✅ Linked to *${user.displayName}*!\n\n${HELP(await defaultLabel(user))}`, { parse_mode: 'Markdown' });
  }
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    return ctx.reply(`👋 Welcome to FairShare!\n\nOpen ${APP}/settings and tap “Connect Telegram” — one tap, no passwords here.`);
  }
  return ctx.reply(`👋 Hey ${user.displayName}!\n\n${HELP(await defaultLabel(user))}`, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  return ctx.reply(HELP(user ? await defaultLabel(user) : 'Personal'), { parse_mode: 'Markdown' });
});

// Legacy: /link <username> <password>
bot.command('link', async (ctx) => {
  const [username, password] = (ctx.match || '').split(/\s+/);
  try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }
  if (!username || !password) return ctx.reply(`Use the one-tap link in ${APP}/settings instead.`);
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return ctx.reply('❌ Invalid username or password.');
  await linkUser(ctx, user.id);
  return ctx.reply(`✅ Linked to *${user.displayName}*!`, { parse_mode: 'Markdown' });
});

async function sendDefaultPicker(ctx, user) {
  const groups = await ledger.listSharedGroups(prisma, user.id);
  const kb = new InlineKeyboard().text(`${user.defaultGroupId ? '' : '✓ '}🙋 Personal`, 'def:p').row();
  groups.forEach((g) => kb.text(`${user.defaultGroupId === g.id ? '✓ ' : ''}👥 ${g.name}`, `def:${g.id}`).row());
  return ctx.reply('Where should plain entries like `milk 20` go?', { reply_markup: kb, parse_mode: 'Markdown' });
}
bot.command(['default', 'setgroup'], async (ctx) => {
  const user = await requireUser(ctx);
  if (user) await sendDefaultPicker(ctx, user);
});
bot.callbackQuery(/^def:(.+)$/, async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) return ctx.answerCallbackQuery();
  const id = ctx.match[1] === 'p' ? null : ctx.match[1];
  let name = 'Personal';
  if (id) {
    const g = await prisma.group.findFirst({ where: { id, deletedAt: null, members: { some: { userId: user.id } } } });
    if (!g) return ctx.answerCallbackQuery({ text: 'Group not found' });
    name = g.name;
  }
  await prisma.user.update({ where: { id: user.id }, data: { defaultGroupId: id } });
  await ctx.answerCallbackQuery({ text: `Default: ${name}` });
  return ctx.editMessageText(`✅ Plain entries now go to *${name}*.\nOverride anytime with \`@group\` or \`#me\`.`, { parse_mode: 'Markdown' });
});

bot.command('groups', async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  const groups = await ledger.listSharedGroups(prisma, user.id);
  if (!groups.length) return ctx.reply(`No groups yet. Create one at ${APP}`);
  const list = groups.map((g) => `• ${g.name} — tag: @${g.name.toLowerCase().replace(/\s+/g, '')}`).join('\n');
  return ctx.reply(`👥 Your groups\n\n${list}\n\nPersonal: #me`);
});

bot.command(['balances', 'balance', 'settle'], async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  const friends = (await ledger.friendBalances(prisma, user.id)).filter((f) => f.net !== 0);
  if (!friends.length) return ctx.reply('✅ All settled up with everyone.');
  const lines = friends.map((f) =>
    f.net > 0 ? `🟢 ${f.user.displayName} owes you ${formatINR(f.net)}` : `🔴 You owe ${f.user.displayName} ${formatINR(-f.net)}`);
  return ctx.reply(`${lines.join('\n')}\n\nSettle: ${APP}/friends`);
});

async function spendReply(ctx, from, to, label) {
  const user = await requireUser(ctx);
  if (!user) return;
  const { items, total, byCategory } = await ledger.mySpending(prisma, user.id, from, to);
  if (!items.length) return ctx.reply(`Nothing spent ${label}. 🎉`);
  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${formatINR(v)}`).join(' · ');
  const recent = items.slice(0, 8).map((i) => `• ${i.description} ${formatINR(i.share)}${i.group.isPersonal ? '' : ` (${i.group.name})`}`).join('\n');
  return ctx.reply(`💰 ${label}: ${formatINR(total)}\n${cats}\n\n${recent}${items.length > 8 ? `\n…and ${items.length - 8} more` : ''}`);
}
function istMidnight(daysAgo = 0) {
  const now = new Date(Date.now() + 5.5 * 3600e3);
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo);
  return new Date(d - 5.5 * 3600e3);
}
bot.command('today', (ctx) => spendReply(ctx, istMidnight(0), new Date(Date.now() + 60e3), 'Today'));
bot.command(['month', 'summary'], (ctx) => {
  const now = new Date(Date.now() + 5.5 * 3600e3);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3600e3);
  return spendReply(ctx, from, new Date(Date.now() + 60e3), now.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }));
});

bot.command('undo', async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  const last = await ledger.undoLast(prisma, user.id);
  return ctx.reply(last ? `↩️ Deleted: ${last.description} ${formatINR(last.amount)}` : 'Nothing to undo (last 24h).');
});

bot.command('review', async (ctx) => {
  const user = await requireUser(ctx);
  if (!user) return;
  const pending = await prisma.expense.findMany({
    where: { createdById: user.id, needsReview: true, deletedAt: null },
    orderBy: { date: 'desc' },
    take: 10,
  });
  if (!pending.length) return ctx.reply('✅ Nothing to review.');
  for (const e of pending.reverse()) await sendReviewPrompt({ prisma, userId: user.id, expense: e });
});

// Review buttons: rv:<expenseId>:<p|x|groupId>
bot.callbackQuery(/^rv:([^:]+):(.+)$/, async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) return ctx.answerCallbackQuery();
  const [, expenseId, target] = ctx.match;
  try {
    if (target === 'x') {
      await prisma.expense.updateMany({ where: { id: expenseId, createdById: user.id }, data: { deletedAt: new Date(), needsReview: false } });
      await ctx.answerCallbackQuery({ text: 'Removed' });
      return ctx.editMessageText('🗑 Removed — not an expense.');
    }
    const updated = await ledger.moveExpense(prisma, { expenseId, userId: user.id, groupId: target === 'p' ? null : target });
    await ctx.answerCallbackQuery({ text: 'Saved' });
    await ctx.editMessageText(`${ledger.describeExpense(updated)}\n(remembered for next time)`);
    if (!updated.group.isPersonal) {
      await notifyExpenseSplitMembers({ prisma, expense: updated, group: updated.group, excludeUserIds: [user.id] });
    }
  } catch (e) {
    console.error('review callback', e);
    return ctx.answerCallbackQuery({ text: e.publicMessage || 'Failed' });
  }
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  const user = await requireUser(ctx);
  if (!user) return;

  // Reply to a review prompt / confirmation = rename (optionally "name 250" or "name @flat")
  const replyTo = ctx.message.reply_to_message?.message_id;
  if (replyTo) {
    const exp = await prisma.expense.findFirst({ where: { reviewMsgId: String(replyTo), createdById: user.id, deletedAt: null } });
    if (exp) {
      const tag = (text.match(/[@#]([\w.-]+)/) || [])[1];
      const name = text.replace(/[@#][\w.-]+/g, '').trim();
      let groupId = exp.groupId;
      if (tag) {
        const g = await ledger.resolveTarget(prisma, { userId: user.id, tag: tag.toLowerCase() }).catch(() => null);
        if (g) groupId = g.isPersonal ? null : g.id;
      } else {
        const g = await prisma.group.findUnique({ where: { id: exp.groupId } });
        groupId = g?.isPersonal ? null : exp.groupId;
      }
      const { guessCategory } = require('../src/lib/parse');
      const updated = await ledger.moveExpense(prisma, {
        expenseId: exp.id, userId: user.id, groupId,
        description: name || exp.description,
        category: name ? guessCategory(name) : undefined,
      });
      return ctx.reply(`${ledger.describeExpense(updated)}\n(remembered for next time)`);
    }
  }

  try {
    // Pasted / forwarded bank SMS
    if (text.length > 40 && parseBankMessage(text)) {
      const r = await ledger.addFromBankMessage(prisma, { userId: user.id, message: text, source: 'telegram-sms' });
      if (r.skipped) return ctx.reply(r.reason === 'duplicate' ? '👌 Already recorded.' : 'Not a payment — ignored.');
      if (!r.known) return sendReviewPrompt({ prisma, userId: user.id, expense: r.expense });
      return ctx.reply(r.message);
    }

    const r = await ledger.addFromText(prisma, { userId: user.id, text, source: 'telegram' });
    const sent = await ctx.reply(r.message, {
      reply_markup: new InlineKeyboard().text('↩️ Undo', `undo:${r.expense.id}`),
    });
    await prisma.expense.update({ where: { id: r.expense.id }, data: { reviewMsgId: String(sent.message_id) } });
    if (!r.expense.group.isPersonal) {
      await notifyExpenseSplitMembers({ prisma, expense: r.expense, group: r.expense.group, excludeUserIds: [user.id] });
    }
  } catch (error) {
    if (error.publicMessage) return ctx.reply(`❌ ${error.publicMessage}`);
    console.error('Telegram quick expense error:', error);
    return ctx.reply('❌ Failed to add expense. Please try again.');
  }
});

bot.callbackQuery(/^undo:(.+)$/, async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) return ctx.answerCallbackQuery();
  const r = await prisma.expense.updateMany({ where: { id: ctx.match[1], createdById: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
  await ctx.answerCallbackQuery({ text: r.count ? 'Undone' : 'Already gone' });
  if (r.count) await ctx.editMessageText('↩️ Undone.');
});

bot.catch((err) => console.error('Bot error:', err.error || err));

bot.api.setMyCommands([
  { command: 'balances', description: 'Who owes whom' },
  { command: 'today', description: "Today's spend" },
  { command: 'month', description: "This month's spend" },
  { command: 'review', description: 'Sort auto-captured payments' },
  { command: 'undo', description: 'Delete last entry' },
  { command: 'default', description: 'Where plain entries go' },
  { command: 'help', description: 'How to use' },
]).catch(() => {});

bot.start();
console.log('🤖 FairShare Bot is running!');
