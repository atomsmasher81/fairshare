import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/utils'
import Link from 'next/link'

export default async function AdminDashboard() {
  const [userCount, groupCount, expenseCount, totalAmount] = await Promise.all([
    prisma.user.count(),
    prisma.group.count({ where: { deletedAt: null } }),
    prisma.expense.count({ where: { deletedAt: null } }),
    prisma.expense.aggregate({
      where: { deletedAt: null },
      _sum: { amount: true },
    }),
  ])

  const recentUsers = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, username: true, displayName: true, createdAt: true, isAdmin: true },
  })

  const recentGroups = await prisma.group.findMany({
    where: { deletedAt: null },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true, expenses: true } } },
  })

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Users</p>
          <p className="text-3xl font-bold text-gray-800">{userCount}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Active Groups</p>
          <p className="text-3xl font-bold text-gray-800">{groupCount}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Expenses</p>
          <p className="text-3xl font-bold text-gray-800">{expenseCount}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Total Amount</p>
          <p className="text-3xl font-bold text-gray-800">{formatAmount(totalAmount._sum.amount || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Users</h2>
            <Link href="/admin/users" className="text-blue-600 text-sm hover:underline">
              View all →
            </Link>
          </div>
          <div className="divide-y">
            {recentUsers.map((user) => (
              <div key={user.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">
                    {user.displayName}
                    {user.isAdmin && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Admin</span>}
                  </p>
                  <p className="text-sm text-gray-500">@{user.username}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Groups */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Groups</h2>
            <Link href="/admin/groups" className="text-blue-600 text-sm hover:underline">
              View all →
            </Link>
          </div>
          <div className="divide-y">
            {recentGroups.map((group) => (
              <div key={group.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{group.name}</p>
                  <p className="text-sm text-gray-500">
                    {group._count.members} members · {group._count.expenses} expenses
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(group.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
