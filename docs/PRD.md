# FairShare - Product Requirements Document

## Overview
A simple expense-sharing app for friends. Track shared expenses, see who owes what, settle up.

**Target users:** Kartik and friends (small private deployment)
**URL:** https://split.kartikgautam.com

---

## Core Features

### 1. Authentication
- Username/password registration & login
- Session-based auth (HTTP-only cookies)
- Admin role for user/group management

### 2. Groups
- Create groups with name & description
- Generate invite codes/links for friends to join
- View all groups you're part of
- Leave group (if not the only member)

### 3. Expenses
- **Fields:**
  - Description (what was it for)
  - Amount
  - Date
  - Category/Type (food, travel, utilities, entertainment, other)
  - Paid by (which group member)
  - Split method: equal / exact amounts / percentages
  - Split between (select members)
- Edit/delete expenses (with activity log)

### 4. Balances
- Per-group balance view (who owes who)
- Overall dashboard: total you owe / total owed to you
- Simplify debts algorithm (minimize transactions)

### 5. Settlements
- Record a payment between two users
- Marks debt as settled (partially or fully)
- Shows in activity feed

### 6. Activity Feed
- Chronological list of actions per group:
  - Expense added/edited/deleted
  - Payment recorded
  - Member joined/left
- Timestamps and who did what

### 7. Admin Dashboard
- View all users (edit/delete)
- View all groups (edit/delete)
- System stats (total users, groups, expenses)

---

## Data Model

```
User
├── id
├── username (unique)
├── passwordHash
├── displayName
├── isAdmin (boolean)
├── createdAt

Group
├── id
├── name
├── description
├── inviteCode (unique)
├── createdBy (userId)
├── createdAt

GroupMember
├── groupId
├── userId
├── joinedAt

Expense
├── id
├── groupId
├── description
├── amount (cents, integer)
├── currency (default: INR)
├── category
├── date
├── paidById (userId)
├── createdById (userId)
├── createdAt
├── updatedAt

ExpenseSplit
├── id
├── expenseId
├── userId
├── amount (cents, what this user owes)

Settlement
├── id
├── groupId
├── fromUserId (who paid)
├── toUserId (who received)
├── amount
├── date
├── note
├── createdAt

Activity
├── id
├── groupId
├── userId (who did it)
├── type (expense_added, expense_edited, expense_deleted, settlement, member_joined, member_left)
├── metadata (JSON)
├── createdAt
```

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** SQLite + Prisma ORM
- **Auth:** Custom (bcrypt + iron-session)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Deployment:** PM2 + nginx on existing VPS

---

## Pages Structure

```
/                     → Landing (redirect to /dashboard if logged in)
/login                → Login form
/register             → Registration form
/dashboard            → Overview: balances, recent activity, groups list
/groups/new           → Create new group
/groups/[id]          → Group detail: expenses, balances, members
/groups/[id]/add      → Add expense form
/groups/[id]/settle   → Record settlement
/groups/join/[code]   → Join group via invite link
/admin                → Admin dashboard (protected)
/admin/users          → User management
/admin/groups         → Group management
```

---

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/groups
POST   /api/groups
GET    /api/groups/[id]
PUT    /api/groups/[id]
DELETE /api/groups/[id]
POST   /api/groups/[id]/join
POST   /api/groups/[id]/leave

GET    /api/groups/[id]/expenses
POST   /api/groups/[id]/expenses
PUT    /api/expenses/[id]
DELETE /api/expenses/[id]

GET    /api/groups/[id]/balances
POST   /api/groups/[id]/settle

GET    /api/groups/[id]/activity

GET    /api/admin/users (admin only)
GET    /api/admin/groups (admin only)
DELETE /api/admin/users/[id] (admin only)
```

---

## V1 Scope (MVP)
✅ User auth (register/login/logout)
✅ Create/join groups via invite code
✅ Add expenses with equal/custom splits
✅ View balances per group
✅ Record settlements
✅ Activity feed
✅ Admin dashboard
✅ Mobile-responsive UI

## Post-V1 (Future)
- Push notifications
- Recurring expenses
- Receipt image upload
- Export to CSV
- Multi-currency
- Dark mode
