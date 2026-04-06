import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { BalanceCard } from '@/components/balance-card'
import { InviteLink } from '@/components/invite-link'
import { ExpenseList } from '@/components/expense-list'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params
  const session = await getSession()
  
  if (!session.isLoggedIn || !session.userId) {
    redirect('/login')
  }

  // Check membership
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: session.userId } },
  })

  if (!membership) {
    notFound()
  }

  // Fetch group with details (excluding soft-deleted expenses)
  const group = await prisma.group.findUnique({
    where: { id, deletedAt: null },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
      expenses: {
        where: { deletedAt: null },
        include: {
          paidBy: { select: { id: true, displayName: true } },
          splits: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 50,
      },
    },
  })

  if (!group) {
    notFound()
  }

  // Calculate balances (only non-deleted expenses)
  const memberBalances = new Map<string, number>()
  group.members.forEach(m => memberBalances.set(m.userId, 0))

  group.expenses.forEach(expense => {
    const current = memberBalances.get(expense.paidById) || 0
    memberBalances.set(expense.paidById, current + expense.amount)
    expense.splits.forEach(split => {
      const curr = memberBalances.get(split.userId) || 0
      memberBalances.set(split.userId, curr - split.amount)
    })
  })

  const settlements = await prisma.settlement.findMany({ where: { groupId: id } })
  settlements.forEach(s => {
    const fromBal = memberBalances.get(s.fromUserId) || 0
    memberBalances.set(s.fromUserId, fromBal + s.amount)
    const toBal = memberBalances.get(s.toUserId) || 0
    memberBalances.set(s.toUserId, toBal - s.amount)
  })

  const userBalance = memberBalances.get(session.userId) || 0

  // Format expenses for the client component
  const formattedExpenses = group.expenses.map(e => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    category: e.category,
    date: e.date.toISOString(),
    paidBy: e.paidBy,
    splits: e.splits.map(s => ({ user: s.user, amount: s.amount })),
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">{group.name}</h1>
          {group.description && (
            <p className="text-gray-500 mt-1">{group.description}</p>
          )}
        </div>
        <Link
          href={`/groups/${id}/add`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          + Add Expense
        </Link>
      </div>

      {/* Balance Summary */}
      <BalanceCard 
        balance={userBalance} 
        groupId={id}
      />

      {/* Invite Link */}
      <InviteLink code={group.inviteCode} />

      {/* Members */}
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h2 className="font-semibold text-gray-800 mb-3">
          Members ({group.members.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {group.members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1"
            >
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-medium">
                {member.user.displayName[0].toUpperCase()}
              </div>
              <span className="text-sm text-gray-700">
                {member.user.displayName}
                {member.userId === session.userId && ' (you)'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-800">Recent Expenses</h2>
        </div>
        <ExpenseList 
          expenses={formattedExpenses} 
          groupId={id}
        />
      </div>
    </div>
  )
}
