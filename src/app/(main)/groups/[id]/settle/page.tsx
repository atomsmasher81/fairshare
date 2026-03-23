'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatAmount, parseAmount } from '@/lib/utils'

interface Member {
  userId: string
  user: {
    id: string
    displayName: string
  }
}

interface Balance {
  owerId: string
  owerName: string
  owedId: string
  owedName: string
  amount: number
}

interface Group {
  id: string
  name: string
  members: Member[]
}

export default function SettlePage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.id as string

  const [group, setGroup] = useState<Group | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [fromUserId, setFromUserId] = useState('')
  const [toUserId, setToUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    Promise.all([
      fetch(`/api/groups/${groupId}`).then(r => r.json()),
      fetch(`/api/groups/${groupId}/balances`).then(r => r.json()),
    ])
      .then(([groupData, balanceData]) => {
        if (groupData.group) {
          setGroup(groupData.group)
          if (groupData.group.members.length >= 2) {
            setFromUserId(groupData.group.members[0].userId)
            setToUserId(groupData.group.members[1].userId)
          }
        }
        if (balanceData.balances) {
          setBalances(balanceData.balances)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load data')
        setLoading(false)
      })
  }, [groupId])

  const handleQuickSettle = (balance: Balance) => {
    setFromUserId(balance.owerId)
    setToUserId(balance.owedId)
    setAmount((balance.amount / 100).toFixed(2))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (fromUserId === toUserId) {
      setError('Cannot settle with yourself')
      return
    }

    const amountPaise = parseAmount(amount)
    if (amountPaise <= 0) {
      setError('Enter a valid amount')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/groups/${groupId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          amount: amountPaise,
          note,
          date,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to record settlement')
        return
      }

      router.push(`/groups/${groupId}`)
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

  if (!group) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Group not found</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link href={`/groups/${groupId}`} className="text-blue-600 hover:text-blue-700 text-sm">
          ← Back to {group.name}
        </Link>
      </div>

      {/* Suggested Settlements */}
      {balances.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">Suggested Settlements</h2>
          <div className="space-y-2">
            {balances.map((balance, i) => (
              <button
                key={i}
                onClick={() => handleQuickSettle(balance)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-left"
              >
                <span className="text-gray-700">
                  <span className="font-medium">{balance.owerName}</span>
                  {' → '}
                  <span className="font-medium">{balance.owedName}</span>
                </span>
                <span className="font-semibold text-gray-800">
                  {formatAmount(balance.amount)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settlement Form */}
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Record Settlement</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Who paid?
            </label>
            <select
              value={fromUserId}
              onChange={(e) => setFromUserId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            >
              {group.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paid to?
            </label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            >
              {group.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
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
                placeholder="0.00"
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
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="e.g., UPI payment"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Recording...' : 'Record Payment'}
          </button>
        </form>
      </div>
    </div>
  )
}
