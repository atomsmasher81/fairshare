'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { EXPENSE_CATEGORIES, parseAmount } from '@/lib/utils'

interface Member {
  userId: string
  user: { id: string; displayName: string }
}

interface Expense {
  id: string
  description: string
  amount: number
  category: string
  date: string
  paidById: string
  splits: { userId: string; amount: number }[]
  group: { id: string; name: string; members: Member[] }
}

export default function EditExpensePage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.id as string
  const expenseId = params.expenseId as string

  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [date, setDate] = useState('')
  const [paidById, setPaidById] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`/api/expenses/${expenseId}`)
      .then(res => res.json())
      .then(data => {
        if (data.expense) {
          const e = data.expense
          setExpense(e)
          setDescription(e.description)
          setAmount((e.amount / 100).toFixed(2))
          setCategory(e.category)
          setDate(new Date(e.date).toISOString().split('T')[0])
          setPaidById(e.paidById)
          setSelectedMembers(e.splits.map((s: { userId: string }) => s.userId))
          
          // Check if it's a custom split
          const equalAmount = Math.floor(e.amount / e.splits.length)
          const isEqual = e.splits.every((s: { amount: number }) => 
            Math.abs(s.amount - equalAmount) <= 1
          )
          setSplitType(isEqual ? 'equal' : 'custom')
          
          if (!isEqual) {
            const splits: Record<string, string> = {}
            e.splits.forEach((s: { userId: string; amount: number }) => {
              splits[s.userId] = (s.amount / 100).toFixed(2)
            })
            setCustomSplits(splits)
          }
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load expense')
        setLoading(false)
      })
  }, [expenseId])

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (selectedMembers.length === 0) {
      setError('Select at least one person to split with')
      return
    }

    const amountPaise = parseAmount(amount)
    if (amountPaise <= 0) {
      setError('Enter a valid amount')
      return
    }

    let splits: { userId: string; amount: number }[] = []

    if (splitType === 'equal') {
      const perPerson = Math.floor(amountPaise / selectedMembers.length)
      const remainder = amountPaise - (perPerson * selectedMembers.length)
      
      splits = selectedMembers.map((userId, index) => ({
        userId,
        amount: perPerson + (index === 0 ? remainder : 0),
      }))
    } else {
      let total = 0
      splits = selectedMembers.map(userId => {
        const splitAmount = parseAmount(customSplits[userId] || '0')
        total += splitAmount
        return { userId, amount: splitAmount }
      })

      if (total !== amountPaise) {
        setError(`Split total (₹${(total/100).toFixed(2)}) doesn't match expense (₹${(amountPaise/100).toFixed(2)})`)
        return
      }
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount: amountPaise,
          category,
          date,
          paidById,
          splits,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to update expense')
        return
      }

      router.push(`/groups/${groupId}`)
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Expense not found</p>
        <Link href={`/groups/${groupId}`} className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Group
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link href={`/groups/${groupId}`} className="text-blue-600 hover:text-blue-700 text-sm">
          ← Back to {expense.group.name}
        </Link>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Edit Expense</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paid by
            </label>
            <select
              value={paidById}
              onChange={(e) => setPaidById(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            >
              {expense.group.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Split type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  splitType === 'equal'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Equal Split
              </button>
              <button
                type="button"
                onClick={() => setSplitType('custom')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  splitType === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Custom Split
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Split between
            </label>
            <div className="space-y-2">
              {expense.group.members.map((member) => (
                <div key={member.userId} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`member-${member.userId}`}
                    checked={selectedMembers.includes(member.userId)}
                    onChange={() => toggleMember(member.userId)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor={`member-${member.userId}`}
                    className="flex-1 text-gray-700"
                  >
                    {member.user.displayName}
                  </label>
                  {splitType === 'custom' && selectedMembers.includes(member.userId) && (
                    <input
                      type="number"
                      step="0.01"
                      value={customSplits[member.userId] || ''}
                      onChange={(e) => setCustomSplits(prev => ({
                        ...prev,
                        [member.userId]: e.target.value,
                      }))}
                      className="w-24 px-3 py-1 border border-gray-300 rounded-lg text-sm"
                      placeholder="₹0.00"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
