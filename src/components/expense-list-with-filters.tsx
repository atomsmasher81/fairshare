'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount, formatDate, getCategoryLabel } from '@/lib/utils'

interface Expense {
  id: string
  description: string
  amount: number
  category: string
  date: string
  paidBy: { id: string; displayName: string }
  paidById: string
  splits: { userId: string; user: { id: string; displayName: string }; amount: number }[]
}

interface Settlement {
  id: string
  fromUser: { id: string; displayName: string }
  toUser: { id: string; displayName: string }
  amount: number
  date: string
  note: string | null
}

interface Member {
  userId: string
  user: { id: string; displayName: string }
}

interface Props {
  expenses: Expense[]
  settlements: Settlement[]
  members: Member[]
  groupId: string
  currentUserId: string
}

type DateFilter = 'all' | 'current-month' | 'prev-month' | 'custom'
type ViewMode = 'expenses' | 'settlements'

export function ExpenseListWithFilters({ expenses, settlements, groupId, currentUserId }: Props) {
  const router = useRouter()
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('expenses')
  const [deleting, setDeleting] = useState<string | null>(null)

  // Filter expenses by date
  const filteredExpenses = expenses.filter(expense => {
    const expenseDate = new Date(expense.date)
    const now = new Date()

    switch (dateFilter) {
      case 'current-month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        return expenseDate >= startOfMonth && expenseDate <= endOfMonth
      }
      case 'prev-month': {
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        return expenseDate >= startOfPrevMonth && expenseDate <= endOfPrevMonth
      }
      case 'custom': {
        if (!customStart || !customEnd) return true
        const start = new Date(customStart)
        const end = new Date(customEnd)
        end.setHours(23, 59, 59, 999)
        return expenseDate >= start && expenseDate <= end
      }
      default:
        return true
    }
  })

  // Filter settlements by date (same logic)
  const filteredSettlements = settlements.filter(settlement => {
    const settlementDate = new Date(settlement.date)
    const now = new Date()

    switch (dateFilter) {
      case 'current-month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        return settlementDate >= startOfMonth && settlementDate <= endOfMonth
      }
      case 'prev-month': {
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        return settlementDate >= startOfPrevMonth && settlementDate <= endOfPrevMonth
      }
      case 'custom': {
        if (!customStart || !customEnd) return true
        const start = new Date(customStart)
        const end = new Date(customEnd)
        end.setHours(23, 59, 59, 999)
        return settlementDate >= start && settlementDate <= end
      }
      default:
        return true
    }
  })

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Delete this expense?')) return
    
    setDeleting(expenseId)
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to delete expense')
      }
    } catch {
      alert('Something went wrong')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="p-5 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Activity</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('expenses')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                viewMode === 'expenses'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Expenses
            </button>
            <button
              onClick={() => setViewMode('settlements')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                viewMode === 'settlements'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Settlements
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded text-sm transition ${
                dateFilter === 'all'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateFilter('current-month')}
              className={`px-3 py-1 rounded text-sm transition ${
                dateFilter === 'current-month'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDateFilter('prev-month')}
              className={`px-3 py-1 rounded text-sm transition ${
                dateFilter === 'prev-month'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => setDateFilter('custom')}
              className={`px-3 py-1 rounded text-sm transition ${
                dateFilter === 'custom'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Custom Range
            </button>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border rounded text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border rounded text-sm"
              />
            </div>
          )}

          <p className="text-xs text-gray-500">
            Showing {viewMode === 'expenses' ? filteredExpenses.length : filteredSettlements.length} {viewMode}
          </p>
        </div>
      </div>

      {/* Expenses View */}
      {viewMode === 'expenses' && (
        <>
          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No expenses for this period
            </div>
          ) : (
            <div className="divide-y">
              {filteredExpenses.map((expense) => (
                <div key={expense.id} className="p-4 hover:bg-gray-50 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getCategoryLabel(expense.category).split(' ')[0]}</span>
                        <span className="font-medium text-gray-800">{expense.description}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Paid by {expense.paidBy.displayName}
                        {expense.paidById === currentUserId && ' (you)'}
                        {' · '}
                        {formatDate(expense.date)}
                      </p>
                    </div>
                    <div className="text-right flex items-start gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{formatAmount(expense.amount)}</p>
                        <p className="text-xs text-gray-500">
                          {expense.splits.length} way split
                        </p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition flex gap-2">
                        <a
                          href={`/groups/${groupId}/expense/${expense.id}/edit`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </a>
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          disabled={deleting === expense.id}
                          className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                        >
                          {deleting === expense.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Settlements View */}
      {viewMode === 'settlements' && (
        <>
          {filteredSettlements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No settlements for this period
            </div>
          ) : (
            <div className="divide-y">
              {filteredSettlements.map((settlement) => (
                <div key={settlement.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">
                        {settlement.fromUser.displayName}
                        {settlement.fromUser.id === currentUserId && ' (you)'}
                        {' → '}
                        {settlement.toUser.displayName}
                        {settlement.toUser.id === currentUserId && ' (you)'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(settlement.date)}
                        {settlement.note && ` · ${settlement.note}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{formatAmount(settlement.amount)}</p>
                      <p className="text-xs text-gray-500">Settlement</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
