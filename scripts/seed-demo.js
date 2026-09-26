// Fills a fresh database with a realistic demo account so you can click around.
//   DATABASE_URL=file:./demo.db npx prisma migrate deploy && DATABASE_URL=file:./demo.db node scripts/seed-demo.js
// Sign in as  demo / demo1234
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ledger = require('../src/lib/ledger');

const prisma = new PrismaClient();
const IST = 5.5 * 3600e3;
const daysAgo = (n, hour = 13) => {
  const d = new Date(Date.now() + IST); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hour, 0, 0, 0);
  return new Date(d.getTime() - IST);
};

(async () => {
  if (await prisma.user.findUnique({ where: { username: 'demo' } })) { console.log('Demo account already exists (demo / demo1234)'); return; }
  const me = await prisma.user.create({ data: { username: 'demo', displayName: 'Aarav Mehta', passwordHash: await bcrypt.hash('demo1234', 10), upiId: 'aarav@okaxis' } });
  const methods = await ledger.listPaymentMethods(prisma, me.id);
  const m = Object.fromEntries(methods.map((x) => [x.name, x.id]));
  const riya = await ledger.addFriend(prisma, me.id, { name: 'Riya Kapoor' });
  const kabir = await ledger.addFriend(prisma, me.id, { name: 'Kabir Shah' });
  const meera = await ledger.addFriend(prisma, me.id, { name: 'Meera Iyer' });
  const mkGroup = (name, ids) => prisma.group.create({ data: { name, inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(), createdById: me.id, members: { create: [me.id, ...ids].map((userId) => ({ userId })) } } });
  const flat = await mkGroup('Flat 3B', [riya.id, kabir.id]);
  const goa = await mkGroup('Goa trip', [riya.id, kabir.id, meera.id]);
  const personal = await ledger.getOrCreatePersonalGroup(prisma, me.id);
  const withRiya = await ledger.getOrCreateDirectGroup(prisma, [me.id, riya.id]);

  const add = (group, d, amt, day, extra = {}) => ledger.createExpense(prisma, { userId: me.id, group, description: d, amount: amt * 100, date: daysAgo(day, extra.hour || 13), ...extra });
  // Personal
  await add(personal, 'Milk', 68, 0, { needLevel: 'essential', paymentMethodId: m.PhonePe, hour: 8 });
  await add(personal, 'Coffee', 220, 0, { needLevel: 'semi', paymentMethodId: m['Google Pay'], hour: 11 });
  await add(personal, 'Groceries', 1840, 1, { needLevel: 'essential', paymentMethodId: m['Credit card'] });
  await add(personal, 'Auto', 150, 1, { needLevel: 'semi', paymentMethodId: m.Cash });
  await add(personal, 'Netflix', 649, 3, { needLevel: 'luxury', paymentMethodId: m['Credit card'], category: 'entertainment' });
  await add(personal, 'Gym', 2500, 5, { needLevel: 'essential', paymentMethodId: m.PhonePe, category: 'health' });
  await add(personal, 'Metro card', 500, 6, { needLevel: 'essential', paymentMethodId: m.PhonePe });
  await add(personal, 'Sneakers', 4299, 8, { needLevel: 'luxury', paymentMethodId: m['Credit card'], category: 'shopping' });
  await add(personal, 'Pharmacy', 380, 9, { needLevel: 'essential', paymentMethodId: m['Google Pay'], category: 'health' });
  await add(personal, 'Lunch', 340, 10, { needLevel: 'semi', paymentMethodId: m.PhonePe });
  // Shared
  await add(flat, 'Rent', 45000, 11, { needLevel: 'essential', paymentMethodId: m.PhonePe, category: 'rent' });
  await add(flat, 'Electricity', 2360, 4, { needLevel: 'essential', paymentMethodId: m['Google Pay'] });
  await add(flat, 'Groceries', 1290, 2, { paidById: kabir.id });
  await add(flat, 'Wifi', 999, 7, { paidById: riya.id });
  await add(goa, 'Villa', 18400, 12, { needLevel: 'luxury', paymentMethodId: m['Credit card'], category: 'travel' });
  await add(goa, 'Seafood dinner', 5200, 12, { paidById: meera.id, hour: 21 });
  await add(goa, 'Scooter rental', 1600, 13, { paidById: kabir.id });
  await add(withRiya, 'Movie tickets', 900, 2, { needLevel: 'luxury', paymentMethodId: m['Google Pay'], hour: 20 });
  await ledger.recordSettlement(prisma, { userId: me.id, fromId: kabir.id, toId: me.id, amount: 5000 * 100, date: daysAgo(3) });
  console.log('Demo ready — sign in as  demo / demo1234');
})().finally(() => prisma.$disconnect());
