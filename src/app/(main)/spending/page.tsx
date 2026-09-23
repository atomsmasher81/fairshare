import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount, getCategoryLabel } from '@/lib/utils'
import { istMonthRange, ledger } from '@/lib/server-data'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ m?: string; c?: string }> }

export default async function SpendingPage({ searchParams }: Props) {
  const sp = await searchParams
  const offset = Math.min(0, Number.parseInt(sp.m || '0', 10) || 0)
  const cat = sp.c
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')
  const userId = session.userId
  const { from, to, label } = istMonthRange(offset)
  const prev = istMonthRange(offset - 1)
  const [spend, prevSpend] = await Promise.all([
    ledger.mySpending(prisma, userId, from, to),
    ledger.mySpending(prisma, userId, prev.from, prev.to),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = cat ? spend.items.filter((i: any) => i.category === cat) : spend.items
  const cats = Object.entries(spend.byCategory as Record<string, number>).sort((a, b) => b[1] - a[1])
  const diff = spend.total - prevSpend.total

  // group by day
  const days = new Map<string, typeof items>()
  for (const i of items) {
    const d = new Date(new Date(i.date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(i)
  }

  const q = (o: number, c?: string) => `/spending?m=${o}${c ? `&c=${c}` : ''}`

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <Link href={q(offset - 1, cat)} className="rounded-full px-3 py-1 text-xl">‹</Link>
        <h1 className="text-xl font-semibold">{label}</h1>
        {offset < 0 ? <Link href={q(offset + 1, cat)} className="rounded-full px-3 py-1 text-xl">›</Link> : <span className="w-10" />}
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-[var(--muted-foreground)]">You spent</p>
        <p className="text-4xl font-semibold tabular-nums">{formatAmount(spend.total)}</p>
        {prevSpend.total > 0 && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {diff >= 0 ? '▲' : '▼'} {formatAmount(Math.abs(diff))} vs {prev.label.split(' ')[0]}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Personal expenses + your share of group expenses</p>
      </section>

      {cats.length > 0 && (
        <section className="space-y-1.5">
          {cats.map(([c, v]) => (
            <Link key={c} href={cat === c ? q(offset) : q(offset, c)}
              className={`block rounded-xl p-2 ${cat === c ? 'bg-[var(--surface-strong)]' : ''}`}>
              <div className="flex justify-between text-sm">
                <span>{getCategoryLabel(c)}</span>
                <span className="tabular-nums">{formatAmount(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[var(--surface)]">
                <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (v / spend.total) * 100)}%` }} />
              </div>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-4">
        {Array.from(days.entries()).map(([d, list]) => (
          <div key={d}>
            <div className="mb-1 flex justify-between text-xs font-medium text-[var(--muted-foreground)]">
              <span>{new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <span>{formatAmount(list.reduce((a: number, i: any) => a + i.share, 0))}</span>
            </div>
            <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {list.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{i.description}{i.needsReview && <span className="ml-1 text-xs text-[var(--accent)]">• unsorted</span>}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {getCategoryLabel(i.category)}{!i.group.isPersonal && ` · ${i.group.name} · ${i.paidBy.displayName} paid ${formatAmount(i.amount)}`}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">{formatAmount(i.share)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {items.length === 0 && <p className="py-8 text-center text-[var(--muted-foreground)]">No expenses.</p>}
      </section>
    </div>
  )
}
