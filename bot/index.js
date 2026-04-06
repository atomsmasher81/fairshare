require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Bot, InlineKeyboard, session } = require('grammy');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Session middleware to store user context (selected group)
bot.use(session({
  initial: () => ({ groupId: null, groupName: null }),
}));

// Helper: Format amount from paise to rupees
const formatAmount = (paise) => `₹${(paise / 100).toFixed(2)}`;

// Helper: Parse amount string to paise
const parseAmount = (str) => Math.round(parseFloat(str) * 100);

// Helper: Get or create user link between Telegram and FairShare
async function getLinkedUser(telegramId) {
  const link = await prisma.telegramLink.findUnique({
    where: { telegramId: String(telegramId) },
    include: { user: true },
  });
  return link?.user || null;
}

// Helper: Link Telegram to FairShare user
async function linkUser(telegramId, telegramUsername, userId) {
  await prisma.telegramLink.upsert({
    where: { telegramId: String(telegramId) },
    update: { userId, telegramUsername },
    create: { telegramId: String(telegramId), telegramUsername, userId },
  });
}

// /start command
bot.command('start', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  
  if (user) {
    await ctx.reply(
      `👋 Welcome back, ${user.displayName}!\n\n` +
      `Commands:\n` +
      `/setgroup - Select active group\n` +
      `/summary - This month's summary\n` +
      `/groups - List your groups\n` +
      `/balance - Your balance in current group\n\n` +
      `Quick add expense: Just type like\n` +
      `\`milk 20\` or \`dinner 450\``,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `👋 Welcome to FairShare Bot!\n\n` +
      `First, link your FairShare account.\n` +
      `Use: /link <username> <password>\n\n` +
      `Don't have an account? Create one at:\n` +
      `https://split.kartikgautam.com/register`
    );
  }
});

// /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📖 *FairShare Bot Commands*\n\n` +
    `/link <user> <pass> - Link your account\n` +
    `/setgroup - Select active group\n` +
    `/groups - List your groups\n` +
    `/summary - This month's summary\n` +
    `/balance - Your balance\n` +
    `/settle - Show who owes whom\n\n` +
    `*Quick expense:*\n` +
    `\`milk 20\` - Add ₹20 expense for milk\n` +
    `\`dinner 450\` - Add ₹450 for dinner\n\n` +
    `Expenses are split equally among all group members.`,
    { parse_mode: 'Markdown' }
  );
});

// /link command - Link Telegram to FairShare account
bot.command('link', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length < 2) {
    await ctx.reply('Usage: /link <username> <password>');
    return;
  }
  
  const [username, password] = args;
  const bcrypt = require('bcryptjs');
  
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });
  
  if (!user) {
    await ctx.reply('❌ User not found. Check your username.');
    return;
  }
  
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await ctx.reply('❌ Invalid password.');
    return;
  }
  
  await linkUser(ctx.from.id, ctx.from.username, user.id);
  
  // Delete the message containing password for security
  try {
    await ctx.deleteMessage();
  } catch (e) {
    // May fail if bot doesn't have delete permission
  }
  
  await ctx.reply(
    `✅ Linked to *${user.displayName}*!\n\n` +
    `Now use /setgroup to pick a group.`,
    { parse_mode: 'Markdown' }
  );
});

// /groups command - List user's groups
bot.command('groups', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('❌ Link your account first with /link');
    return;
  }
  
  const groups = await prisma.group.findMany({
    where: { 
      members: { some: { userId: user.id } },
      deletedAt: null,
    },
    include: { _count: { select: { members: true } } },
  });
  
  if (groups.length === 0) {
    await ctx.reply('You\'re not in any groups yet.\nCreate one at https://split.kartikgautam.com');
    return;
  }
  
  const list = groups.map(g => `• *${g.name}* (${g._count.members} members)`).join('\n');
  await ctx.reply(`📂 *Your Groups:*\n\n${list}`, { parse_mode: 'Markdown' });
});

// /setgroup command - Select active group
bot.command('setgroup', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('❌ Link your account first with /link');
    return;
  }
  
  const groups = await prisma.group.findMany({
    where: { 
      members: { some: { userId: user.id } },
      deletedAt: null,
    },
  });
  
  if (groups.length === 0) {
    await ctx.reply('You\'re not in any groups yet.');
    return;
  }
  
  const keyboard = new InlineKeyboard();
  groups.forEach(g => {
    keyboard.text(g.name, `setgroup:${g.id}`).row();
  });
  
  await ctx.reply('Select a group:', { reply_markup: keyboard });
});

// Handle group selection callback
bot.callbackQuery(/^setgroup:(.+)$/, async (ctx) => {
  const groupId = ctx.match[1];
  const user = await getLinkedUser(ctx.from.id);
  
  const group = await prisma.group.findUnique({ where: { id: groupId, deletedAt: null } });
  if (!group) {
    await ctx.answerCallbackQuery({ text: 'Group not found or deleted' });
    return;
  }
  
  ctx.session.groupId = groupId;
  ctx.session.groupName = group.name;
  
  await ctx.answerCallbackQuery({ text: `Selected: ${group.name}` });
  await ctx.editMessageText(`✅ Active group: *${group.name}*\n\nNow just type expenses like \`chai 40\``, { parse_mode: 'Markdown' });
});

// /summary command - Show current month summary
bot.command('summary', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('❌ Link your account first with /link');
    return;
  }
  
  if (!ctx.session.groupId) {
    await ctx.reply('❌ No group selected. Use /setgroup first.');
    return;
  }
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const expenses = await prisma.expense.findMany({
    where: {
      groupId: ctx.session.groupId,
      date: { gte: startOfMonth },
      deletedAt: null,
    },
    include: { paidBy: true },
    orderBy: { date: 'desc' },
  });
  
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const byCategory = {};
  expenses.forEach(e => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  
  let msg = `📊 *${ctx.session.groupName}* - ${now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}\n\n`;
  msg += `*Total:* ${formatAmount(total)}\n`;
  msg += `*Expenses:* ${expenses.length}\n\n`;
  
  if (Object.keys(byCategory).length > 0) {
    msg += `*By category:*\n`;
    for (const [cat, amt] of Object.entries(byCategory)) {
      msg += `• ${cat}: ${formatAmount(amt)}\n`;
    }
  }
  
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// /balance command - Show user's balance in current group
bot.command('balance', async (ctx) => {
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('❌ Link your account first with /link');
    return;
  }
  
  if (!ctx.session.groupId) {
    await ctx.reply('❌ No group selected. Use /setgroup first.');
    return;
  }
  
  // Calculate balance
  const expenses = await prisma.expense.findMany({
    where: { groupId: ctx.session.groupId, deletedAt: null },
    include: { splits: true },
  });
  
  const settlements = await prisma.settlement.findMany({
    where: { groupId: ctx.session.groupId },
  });
  
  let balance = 0;
  expenses.forEach(e => {
    if (e.paidById === user.id) balance += e.amount;
    e.splits.forEach(s => {
      if (s.userId === user.id) balance -= s.amount;
    });
  });
  
  settlements.forEach(s => {
    if (s.fromUserId === user.id) balance += s.amount;
    if (s.toUserId === user.id) balance -= s.amount;
  });
  
  const status = balance > 0 
    ? `You are owed ${formatAmount(balance)} 💚`
    : balance < 0 
      ? `You owe ${formatAmount(Math.abs(balance))} 🔴`
      : `All settled up! ✅`;
  
  await ctx.reply(
    `💰 *Your balance in ${ctx.session.groupName}:*\n\n${status}`,
    { parse_mode: 'Markdown' }
  );
});

// Handle plain text messages as quick expenses
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Skip if it's a command
  if (text.startsWith('/')) return;
  
  const user = await getLinkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('❌ Link your account first with /link <username> <password>');
    return;
  }
  
  if (!ctx.session.groupId) {
    await ctx.reply('❌ No group selected. Use /setgroup first.');
    return;
  }

  // Verify group still exists and not deleted
  const group = await prisma.group.findUnique({ 
    where: { id: ctx.session.groupId, deletedAt: null } 
  });
  if (!group) {
    ctx.session.groupId = null;
    ctx.session.groupName = null;
    await ctx.reply('❌ Group no longer exists. Use /setgroup to pick another.');
    return;
  }
  
  // Parse: "description amount" e.g., "milk 20" or "dinner 450"
  const match = text.match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
  if (!match) {
    await ctx.reply(
      '❓ Didn\'t understand. Format:\n' +
      '`milk 20` or `dinner 450`',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const description = match[1].trim();
  const amount = parseAmount(match[2]);
  
  if (amount <= 0) {
    await ctx.reply('❌ Amount must be greater than 0');
    return;
  }
  
  // Get group members for split
  const members = await prisma.groupMember.findMany({
    where: { groupId: ctx.session.groupId },
    include: { user: { select: { id: true, displayName: true } } },
  });
  
  const splitAmount = Math.floor(amount / members.length);
  const remainder = amount - (splitAmount * members.length);
  
  // Create expense with equal splits
  const expense = await prisma.expense.create({
    data: {
      groupId: ctx.session.groupId,
      description,
      amount,
      category: 'other',
      date: new Date(),
      paidById: user.id,
      createdById: user.id,
      splits: {
        create: members.map((m, i) => ({
          userId: m.userId,
          amount: splitAmount + (i === 0 ? remainder : 0),
        })),
      },
    },
  });
  
  // Log activity
  await prisma.activity.create({
    data: {
      groupId: ctx.session.groupId,
      userId: user.id,
      type: 'expense_added',
      metadata: JSON.stringify({ expenseId: expense.id, description, amount, source: 'telegram' }),
    },
  });
  
  const splitInfo = members.map(m => m.user.displayName).join(', ');
  await ctx.reply(
    `✅ Added *${description}* - ${formatAmount(amount)}\n` +
    `Split between: ${splitInfo}\n` +
    `(${formatAmount(splitAmount)} each)`,
    { parse_mode: 'Markdown' }
  );
});

// Start the bot
bot.start();
console.log('🤖 FairShare Bot is running!');
