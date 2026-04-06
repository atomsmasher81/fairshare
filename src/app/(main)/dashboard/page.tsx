import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount } from '@/lib/utils'
import { Prisma } from '@prisma/client'

// Define the type for groups with includes
type GroupWithDetails = Prisma.GroupGetPayload<{
  include: {
    members: {
      include: {
        user: { select: { id: true; displayName: true } }
      }
    }
    expenses: {
      include: { splits: true }
    }
    settlements: true
    _count: { select: { expenses: true } }
  }
}>

export default async function DashboardPage() {
  const session = await getSession()
  const userId = session.userId!

  // Fetch user's groups with member info (excluding deleted)
  const groups: GroupWithDetails[] = await prisma.group.findMany({
    where: {
      members: { some: { userId } },
      deletedAt: null,
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true } },
        },
      },
      expenses: {
        where: { deletedAt: null },
        include: { splits: true },
      },
      settlements: true,
      _count: { select: { expenses: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Calculate overall balance across all groups
  let totalOwed = 0
  let totalOwing = 0

  for (const group of groups) {
    let netBalance = 0

    for (const expense of group.expenses) {
      if (expense.paidById === userId) {
        netBalance += expense.amount
      }
      for (const split of expense.splits) {
        if (split.userId === userId) {
          netBalance -= split.amount
        }
      }
    }

    for (const settlement of group.settlements) {
      if (settlement.fromUserId === userId) {
        netBalance += settlement.amount
      }
      if (settlement.toUserId === userId) {
        netBalance -= settlement.amount
      }
    }

    if (netBalance > 0) {
      totalOwed += netBalance
    } else {
      totalOwing += Math.abs(netBalance)
    }
  }

  return (
    <div className="space-y-6">
      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <p className="text-sm text-gray-500 mb-1">You are owed</p>
          <p className="text-2xl font-bold text-green-600">
            {formatAmount(totalOwed)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <p className="text-sm text-gray-500 mb-1">You owe</p>
          <p className="text-2xl font-bold text-red-600">
            {formatAmount(totalOwing)}
          </p>
        </div>
      </div>

      {/* Groups */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Your Groups</h2>
          <Link
            href="/groups/new"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Create new →
          </Link>
        </div>

        {groups.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-sm border text-center">
            <p className="text-gray-500 mb-4">You&apos;re not in any groups yet</p>
            <Link
              href="/groups/new"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Create your first group
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {groups.map((group: GroupWithDetails) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="bg-white rounded-xl p-5 shadow-sm border hover:shadow-md transition block"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">{group.name}</h3>
                    <p className="text-sm text-gray-500">
                      {group.members.length} member{group.members.length !== 1 ? 's' : ''} · {group._count.expenses} expense{group._count.expenses !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-gray-400">→</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
