'use client'

import Link from 'next/link'
import { formatAmount } from '@/lib/utils'

interface BalanceCardProps {
  balance: number
  groupId: string
}

export function BalanceCard({ balance, groupId }: BalanceCardProps) {
  const isPositive = balance > 0
  const isZero = balance === 0

  return (
    <div className={`rounded-xl p-5 shadow-sm border ${
      isZero ? 'bg-gray-50' : isPositive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">Your balance</p>
          <p className={`text-2xl font-bold ${
            isZero ? 'text-gray-600' : isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            {isPositive ? '+' : ''}{formatAmount(Math.abs(balance))}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {isZero ? "You're all settled up!" : isPositive ? "You're owed money" : "You owe money"}
          </p>
        </div>
        {!isZero && (
          <Link
            href={`/groups/${groupId}/settle`}
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition border"
          >
            Settle Up
          </Link>
        )}
      </div>
    </div>
  )
}
