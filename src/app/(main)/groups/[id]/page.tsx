import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount, formatDate, getCategoryLabel } from '@/lib/utils'
import { BalanceCard } from '@/components/balance-card'
import { InviteLink } from '@/components/invite-link'

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

  // Fetch group with details
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
      expenses: {
        include: {
          paidBy: { select: { id: true, displayName: true } },
          splits: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 20,
      },
    },
  })

  if (!group) {
    notFound()
  }

  // Calculate balances
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

        {group.expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No expenses yet. Add your first expense!
          </div>
        ) : (
          <div className="divide-y">
            {group.expenses.map((expense) => (
              <div key={expense.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getCategoryLabel(expense.category).split(' ')[0]}</span>
                      <span className="font-medium text-gray-800">{expense.description}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Paid by {expense.paidBy.displayName} · {formatDate(expense.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">{formatAmount(expense.amount)}</p>
                    <p className="text-xs text-gray-500">
                      {expense.splits.length} way split
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
