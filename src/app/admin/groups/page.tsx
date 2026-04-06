'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatAmount } from '@/lib/utils'

interface Group {
  id: string
  name: string
  description: string | null
  inviteCode: string
  createdAt: string
  deletedAt: string | null
  _count: {
    members: number
    expenses: number
  }
  _sum: {
    amount: number | null
  }
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchGroups = useCallback(async () => {
    const res = await fetch(`/api/admin/groups?includeDeleted=${showDeleted}`)
    const data = await res.json()
    setGroups(data.groups || [])
    setLoading(false)
  }, [showDeleted])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups, refreshKey])

  const handleDelete = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return
    
    const res = await fetch(`/api/admin/groups/${groupId}`, { method: 'DELETE' })
    if (res.ok) {
      setRefreshKey(k => k + 1)
    }
  }

  const handleRestore = async (groupId: string) => {
    const res = await fetch(`/api/admin/groups/${groupId}/restore`, { method: 'POST' })
    if (res.ok) {
      setRefreshKey(k => k + 1)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Groups</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="rounded"
          />
          Show deleted
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Group</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Members</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Expenses</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((group) => (
              <tr key={group.id} className={`hover:bg-gray-50 ${group.deletedAt ? 'opacity-60' : ''}`}>
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-800">{group.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{group.inviteCode}</p>
                </td>
                <td className="px-6 py-4 text-gray-600">{group._count.members}</td>
                <td className="px-6 py-4 text-gray-600">{group._count.expenses}</td>
                <td className="px-6 py-4 text-gray-600">{formatAmount(group._sum.amount || 0)}</td>
                <td className="px-6 py-4 text-gray-500 text-sm">
                  {new Date(group.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {group.deletedAt ? (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">Deleted</span>
                  ) : (
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">Active</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {group.deletedAt ? (
                    <button
                      onClick={() => handleRestore(group.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDelete(group.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No groups found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
