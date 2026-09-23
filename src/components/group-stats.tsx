'use client'

import { formatAmount } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

interface GroupStatsProps {
  totalExpenses: number
  userPaid: number
  userBalance: number
}

export function GroupStats({ totalExpenses, userPaid, userBalance }: GroupStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="pt-6">
          <p className="mb-1 text-sm text-[var(--muted-foreground)]">Total Expenses</p>
          <p className="text-2xl font-semibold text-[var(--foreground)]">{formatAmount(totalExpenses)}</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <p className="mb-1 text-sm text-[var(--muted-foreground)]">You Paid</p>
          <p className="text-2xl font-semibold text-[var(--accent)]">{formatAmount(userPaid)}</p>
        </CardContent>
      </Card>
      
      <div className={`rounded-2xl border p-5 shadow-[var(--shadow-card)] ${
        userBalance === 0
          ? 'border-[var(--border)] bg-[var(--surface)]'
          : userBalance > 0
            ? 'border-[rgba(31,138,101,0.18)] bg-[var(--success-soft)]'
            : 'border-[var(--danger-border)] bg-[var(--danger-soft)]'
      }`}>
        <p className="mb-1 text-sm text-[var(--muted-foreground)]">
          {userBalance >= 0 ? 'You Get Back' : 'You Owe'}
        </p>
        <p className={`text-2xl font-semibold ${
          userBalance === 0
            ? 'text-[var(--foreground)]'
            : userBalance > 0
              ? 'text-[var(--success)]'
              : 'text-[var(--danger)]'
        }`}>
          {formatAmount(Math.abs(userBalance))}
        </p>
        {userBalance === 0 && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">All settled up!</p>
        )}
      </div>
    </div>
  )
}
