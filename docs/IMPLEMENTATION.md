# FairShare - Implementation Plan

## Phase 1: Project Setup (Day 1)
- [x] Initialize Next.js 14 project
- [x] Set up Tailwind CSS + shadcn/ui
- [x] Configure Prisma with SQLite
- [x] Define database schema
- [x] Set up project structure

## Phase 2: Authentication (Day 1-2)
- [ ] User model + password hashing (bcrypt)
- [ ] Register API + page
- [ ] Login API + page
- [ ] Session management (iron-session)
- [ ] Auth middleware
- [ ] Protected routes

## Phase 3: Groups (Day 2-3)
- [ ] Group CRUD APIs
- [ ] Create group page
- [ ] Group list on dashboard
- [ ] Invite code generation
- [ ] Join group via link
- [ ] Group detail page (members list)

## Phase 4: Expenses (Day 3-4)
- [ ] Expense model with splits
- [ ] Add expense API
- [ ] Add expense form (equal/custom split UI)
- [ ] Expense list view
- [ ] Edit/delete expense
- [ ] Category selection

## Phase 5: Balances & Settlements (Day 4-5)
- [ ] Balance calculation logic
- [ ] Simplify debts algorithm
- [ ] Balance display per group
- [ ] Dashboard total balances
- [ ] Settlement API
- [ ] Record payment UI

## Phase 6: Activity Feed (Day 5)
- [ ] Activity logging on all actions
- [ ] Activity feed API
- [ ] Activity feed UI component

## Phase 7: Admin Dashboard (Day 5-6)
- [ ] Admin middleware
- [ ] User management page
- [ ] Group management page
- [ ] Stats overview

## Phase 8: Polish & Deploy (Day 6-7)
- [ ] Mobile responsive tweaks
- [ ] Error handling
- [ ] Loading states
- [ ] Deploy to split.kartikgautam.com
- [ ] SSL setup

---

## File Structure

```
fairshare/
├── docs/
│   ├── PRD.md
│   └── IMPLEMENTATION.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (main)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── groups/
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── add/page.tsx
│   │   │   │       └── settle/page.tsx
│   │   │   └── join/[code]/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── groups/page.tsx
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── groups/
│   │   │   ├── expenses/
│   │   │   └── admin/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/ (shadcn)
│   │   ├── expense-form.tsx
│   │   ├── balance-card.tsx
│   │   ├── activity-feed.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── session.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── public/
├── .env
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Key Decisions

### Balance Calculation
Store individual splits per expense. Calculate balances by:
1. Sum all amounts user paid for group
2. Sum all amounts user owes (from splits)
3. Factor in settlements
4. Net balance = paid - owes + received_settlements - sent_settlements

### Simplify Debts
Use greedy algorithm:
1. Calculate net balance for each user
2. Match biggest creditor with biggest debtor
3. Settle minimum of the two amounts
4. Repeat until all balanced

### Currency
Store amounts in smallest unit (paise for INR) as integers to avoid floating point issues.
Display: amount / 100 with 2 decimal places.

### Invite Codes
Generate 8-character alphanumeric codes. URL format:
`https://split.kartikgautam.com/join/ABC12345`
