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
  splits: { user: { id: string; displayName: string }; amount: number }[]
}

interface ExpenseListProps {
  expenses: Expense[]
  groupId: string
}

export function ExpenseList({ expenses, groupId }: ExpenseListProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (expenseId: string) => {
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

  if (expenses.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No expenses yet. Add your first expense!
      </div>
    )
  }

  return (
    <div className="divide-y">
      {expenses.map((expense) => (
        <div key={expense.id} className="p-4 hover:bg-gray-50 group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getCategoryLabel(expense.category).split(' ')[0]}</span>
                <span className="font-medium text-gray-800">{expense.description}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Paid by {expense.paidBy.displayName} · {formatDate(expense.date)}
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
                  onClick={() => handleDelete(expense.id)}
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
  )
}
