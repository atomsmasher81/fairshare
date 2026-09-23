'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/utils'
import type { LedgerOption } from './quick-add'

interface Item { id: string; description: string; amount: number; date: string; payee: string | null }

export function ReviewInbox({ items, ledgers }: { items: Item[]; ledgers: LedgerOption[] }) {
  const router = useRouter()
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())

  const act = async (id: string, groupId: string | null | 'delete') => {
    setBusy(id)
    const res = groupId === 'delete'
      ? await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      : await fetch(`/api/expenses/${id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId, description: names[id] }),
        })
    setBusy(null)
    if (res.ok) {
      setDone((d) => new Set(d).add(id))
      router.refresh()
    }
  }

  const visible = items.filter((i) => !done.has(i.id))
  if (!visible.length) return null

  return (
    <section className="rounded-2xl border border-[rgba(245,78,0,0.25)] bg-[rgba(245,78,0,0.05)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">📥 To sort ({visible.length})</h2>
        <span className="text-xs text-[var(--muted-foreground)]">Auto-captured from UPI · remembered next time</span>
      </div>
      <ul className="space-y-3">
        {visible.map((i) => (
          <li key={i.id} className="rounded-xl bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <input
                defaultValue={i.description}
                onChange={(e) => setNames((n) => ({ ...n, [i.id]: e.target.value }))}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              />
              <span className="font-semibold tabular-nums">{formatAmount(i.amount)}</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {new Date(i.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              {i.payee ? ` · ${i.payee}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ledgers.map((l) => (
                <button key={l.id ?? 'p'} disabled={busy === i.id} onClick={() => act(i.id, l.id)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm hover:border-[var(--foreground)]">
                  {l.id ? `👥 ${l.name}` : '🙋 Personal'}
                </button>
              ))}
              <button disabled={busy === i.id} onClick={() => act(i.id, 'delete')}
                className="rounded-full px-3 py-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--danger)]">
                Not an expense
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
