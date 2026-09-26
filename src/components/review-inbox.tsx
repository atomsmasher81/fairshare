'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Inbox, X } from 'lucide-react'
import { inr, NEEDS, NEED_META, relativeTime } from '@/lib/format'
import { toast } from '@/components/kit'

interface Item { id: string; description: string; amount: number; date: string; payee: string | null }

/**
 * Payments captured automatically (bank SMS / Telegram) land here until you say what they were.
 * One tap on a type files it as personal and remembers the payee for next time.
 */
export function ReviewInbox({ items }: { items: Item[] }) {
  const router = useRouter()
  const [names, setNames] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Set<string>>(new Set())

  const finish = (id: string) => { setDone((d) => new Set(d).add(id)); router.refresh() }

  const file = async (id: string, needLevel: string) => {
    const res = await fetch(`/api/expenses/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: null, needLevel, description: names[id] }),
    })
    if (res.ok) finish(id)
    else toast('Couldn’t save', { tone: 'error' })
  }
  const dismiss = async (id: string) => {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    if (res.ok) {
      finish(id)
      toast('Removed', { action: { label: 'Undo', run: async () => { await fetch(`/api/expenses/${id}/restore`, { method: 'POST' }); router.refresh() } } })
    }
  }

  const visible = items.filter((i) => !done.has(i.id))
  if (!visible.length) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Inbox size={16} className="text-neg" />
        <h2 className="text-[15px] font-semibold">To sort <span className="text-muted">· {visible.length}</span></h2>
      </div>
      <div className="card divide-y divide-line/[0.07] overflow-hidden">
        {visible.map((i) => (
          <div key={i.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                defaultValue={i.description}
                onChange={(e) => setNames((n) => ({ ...n, [i.id]: e.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
                aria-label="Description"
              />
              <span className="num font-semibold">{inr(i.amount)}</span>
              <button onClick={() => dismiss(i.id)} className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-fg" aria-label="Not an expense">
                <X size={15} />
              </button>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">{relativeTime(i.date)}{i.payee ? ` · ${i.payee}` : ''}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {NEEDS.map((n) => (
                <button key={n} onClick={() => file(i.id, n)}
                  className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-line/10 px-3 text-[13px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: NEED_META[n].color }} />{NEED_META[n].short}
                </button>
              ))}
              <Link href={`/expense/${i.id}?back=/home`} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] text-muted hover:text-fg">
                Split / edit…
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
