'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Users, X } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/kit'
import { inr } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface PeopleItem {
  kind: 'friend' | 'group'
  id: string
  name: string
  sub: string | null // "Not on FairShare yet", "3 members"
  net: number // + they owe you / you're owed, − you owe
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'friend', label: 'Friends' },
  { key: 'group', label: 'Groups' },
  { key: 'owed', label: 'Owe you' },
  { key: 'owe', label: 'You owe' },
  { key: 'settled', label: 'Settled' },
] as const
type Filter = (typeof FILTERS)[number]['key']

/** Friends and groups in one list, open balances first, with quick filters and search. */
export function PeopleList({ items }: { items: PeopleItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const counts = useMemo(() => ({
    all: items.length,
    friend: items.filter((i) => i.kind === 'friend').length,
    group: items.filter((i) => i.kind === 'group').length,
    owed: items.filter((i) => i.net > 0).length,
    owe: items.filter((i) => i.net < 0).length,
    settled: items.filter((i) => i.net === 0).length,
  }), [items])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items
      .filter((i) => filter === 'all' || (filter === 'friend' || filter === 'group' ? i.kind === filter
        : filter === 'owed' ? i.net > 0 : filter === 'owe' ? i.net < 0 : i.net === 0))
      .filter((i) => !needle || i.name.toLowerCase().includes(needle))
      .sort((a, b) => (b.net !== 0 ? 1 : 0) - (a.net !== 0 ? 1 : 0) || Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name))
  }, [items, filter, q])

  return (
    <div className="space-y-3">
      {items.length > 6 && (
        <label className="card flex h-11 items-center gap-2 px-4">
          <Search size={16} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends and groups"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-faint"><X size={16} /></button>}
        </label>
      )}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] transition-colors',
              filter === f.key ? 'border-ink bg-ink text-ink-fg' : 'border-line/10 bg-card')}>
            {f.label}<span className={cn('text-[12px]', filter === f.key ? 'opacity-70' : 'text-faint')}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="card divide-y divide-line/[0.07] overflow-hidden">
          {shown.map((i) => (
            <Link key={`${i.kind}-${i.id}`} href={i.kind === 'friend' ? `/friends/${i.id}` : `/groups/${i.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-fg/[0.025] active:bg-fg/[0.05]">
              {i.kind === 'friend' ? (
                <Avatar name={i.name} id={i.id} />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunken text-muted"><Users size={18} /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                <p className="truncate text-[12.5px] text-muted">{i.kind === 'group' ? 'Group' : 'Friend'}{i.sub ? ` · ${i.sub}` : ''}</p>
              </div>
              {i.net === 0 ? <span className="shrink-0 text-[13px] text-muted">settled up</span> : (
                <span className="shrink-0 text-right">
                  <span className={cn('num block text-[15px] font-semibold', i.net > 0 ? 'text-pos' : 'text-neg')}>{inr(Math.abs(i.net))}</span>
                  <span className="block text-[12px] text-muted">
                    {i.kind === 'friend' ? (i.net > 0 ? 'owes you' : 'you owe') : (i.net > 0 ? 'you’re owed' : 'you owe')}
                  </span>
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={<Users size={28} />} title={items.length ? 'Nothing matches' : 'No friends or groups yet'}>
            {items.length ? 'Try another filter.' : 'Add someone by name — they don’t need an account — or create a group.'}
          </EmptyState>
        </div>
      )}
    </div>
  )
}
