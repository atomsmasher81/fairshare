import { prisma } from '@/lib/prisma'

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { groupMemberships: true, expensesPaid: true },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
        <p className="text-gray-500">{users.length} total</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Groups</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Expenses</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium text-sm">
                      {user.displayName[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{user.displayName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">@{user.username}</td>
                <td className="px-6 py-4 text-gray-600">{user._count.groupMemberships}</td>
                <td className="px-6 py-4 text-gray-600">{user._count.expensesPaid}</td>
                <td className="px-6 py-4 text-gray-500 text-sm">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {user.isAdmin ? (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">Admin</span>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">User</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
