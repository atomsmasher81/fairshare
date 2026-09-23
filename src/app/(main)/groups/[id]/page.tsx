import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { InviteLink } from '@/components/invite-link'
import { GroupStats } from '@/components/group-stats'
import { ExpenseListWithFilters } from '@/components/expense-list-with-filters'
import { GroupMembersManager } from '@/components/group-members-manager'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params
  const session = await getSession()
  
  if (!session.isLoggedIn || !session.userId) {
    redirect('/login')
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: session.userId } },
  })

  if (!membership) {
    notFound()
  }

  const group = await prisma.group.findUnique({
    where: { id, deletedAt: null },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
    },
  })

  if (!group) {
    notFound()
  }

  const allExpenses = await prisma.expense.findMany({
    where: { groupId: id, deletedAt: null },
    include: {
      paidBy: { select: { id: true, displayName: true } },
      splits: {
        include: { user: { select: { id: true, displayName: true } } },
      },
    },
    orderBy: { date: 'desc' },
  })

  const settlements = await prisma.settlement.findMany({
    where: { groupId: id },
    include: {
      fromUser: { select: { id: true, displayName: true } },
      toUser: { select: { id: true, displayName: true } },
    },
    orderBy: { date: 'desc' },
  })

  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0)
  const userPaid = allExpenses
    .filter(e => e.paidById === session.userId)
    .reduce((sum, e) => sum + e.amount, 0)

  let userBalance = 0
  allExpenses.forEach(expense => {
    if (expense.paidById === session.userId) {
      userBalance += expense.amount
    }
    expense.splits.forEach(split => {
      if (split.userId === session.userId) {
        userBalance -= split.amount
      }
    })
  })

  settlements.forEach(s => {
    if (s.fromUserId === session.userId) userBalance += s.amount
    if (s.toUserId === session.userId) userBalance -= s.amount
  })

  const formattedExpenses = allExpenses.map(e => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    category: e.category,
    date: e.date.toISOString(),
    paidBy: e.paidBy,
    paidById: e.paidById,
    splits: e.splits.map(s => ({ userId: s.userId, user: s.user, amount: s.amount })),
  }))

  const formattedSettlements = settlements.map(s => ({
    id: s.id,
    fromUser: s.fromUser,
    toUser: s.toUser,
    amount: s.amount,
    date: s.date.toISOString(),
    note: s.note,
  }))

  const formattedMembers = group.members.map(m => ({
    userId: m.userId,
    user: m.user,
  }))

  const canManageMembers = session.isAdmin || group.createdById === session.userId

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.48),rgba(255,255,255,0.18))] p-6 shadow-[var(--shadow-card)] md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/dashboard" className="mb-3 inline-block text-sm font-medium text-[var(--accent)] hover:opacity-80">
            ← Back
          </Link>
          <p className="eyebrow mb-2">Group workspace</p>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">{group.name}</h1>
          {group.description && (
            <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">{group.description}</p>
          )}
        </div>
        <div className="flex gap-2 self-start">
          <Link href={`/groups/${id}/settle`}>
            <Button variant="secondary">Settle Up</Button>
          </Link>
          <Link href={`/groups/${id}/add`}>
            <Button>+ Add Expense</Button>
          </Link>
        </div>
      </div>

      <GroupStats
        totalExpenses={totalExpenses}
        userPaid={userPaid}
        userBalance={userBalance}
      />

      <InviteLink code={group.inviteCode} />

      <Card>
        <CardHeader>
          <CardTitle>Members ({group.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <GroupMembersManager
            groupId={id}
            members={group.members}
            currentUserId={session.userId}
            canManageMembers={canManageMembers}
          />
        </CardContent>
      </Card>

      <ExpenseListWithFilters
        expenses={formattedExpenses}
        settlements={formattedSettlements}
        members={formattedMembers}
        groupId={id}
        currentUserId={session.userId}
      />
    </div>
  )
}
