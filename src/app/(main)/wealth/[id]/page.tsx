import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/queries'
import { accountDetail, kindMeta } from '@/lib/wealth'
import { inr, shortDate } from '@/lib/format'
import { PageHeader, Section } from '@/components/kit'
import { AccountActions, DeleteSnapshotButton } from '@/components/wealth-client'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account' }

type Item =
  | { type: 'snap'; id: string; date: Date; at: Date; invested: number; value: number; note: string | null; source: string }
  | { type: 'inv'; id: string; date: Date; at: Date; amount: number; description: string }

export default async function AccountPage({ params }: { params: { id: string } }) {
  const userId = await requireUserId()
  const d = await accountDetail(userId, params.id)
  if (!d) notFound()
  const { asset: a, position: p } = d
  const m = kindMeta(a.kind)
  const isLoan = a.kind === 'loan'
  const gain = p.value - p.invested

  const items: Item[] = [
    ...a.snapshots.map((s) => ({ type: 'snap' as const, id: s.id, date: s.date, at: s.createdAt, invested: s.invested, value: s.value, note: s.note, source: s.source })),
    ...a.expenses.map((e) => ({ type: 'inv' as const, id: e.id, date: e.date, at: e.createdAt, amount: e.amount, description: e.description })),
  ].sort((x, y) => y.date.getTime() - x.date.getTime() || y.at.getTime() - x.at.getTime())

  return (
    <div className="space-y-6">
      <PageHeader title={a.name} back="/wealth" subtitle={`${m.emoji} ${m.label}${a.archivedAt ? ' · archived' : ''}`} />

      <div className="card p-5">
        <p className="text-[14px] text-muted">{isLoan ? 'Still owed' : 'Worth now'}</p>
        <p className="num mt-1 text-[36px] font-semibold leading-none tracking-[-0.04em]">{inr(p.value, { decimals: 'never' })}</p>
        {!isLoan && p.invested > 0 && (
          <p className="mt-2 text-[14px] text-muted">
            {inr(p.invested, { decimals: 'never' })} put in ·{' '}
            <span className={cn('num font-medium', gain > 0 ? 'text-pos' : gain < 0 ? 'text-neg' : '')}>
              {gain > 0 ? '+' : gain < 0 ? '−' : ''}{inr(Math.abs(gain), { decimals: 'never' })} ({gain >= 0 ? '+' : ''}{((gain / p.invested) * 100).toFixed(1)}%)
            </span>
          </p>
        )}
        {p.addedSince > 0 && <p className="mt-1 text-[13px] text-muted">Includes {inr(p.addedSince, { decimals: 'never' })} logged since the last update</p>}
      </div>

      <AccountActions id={a.id} name={a.name} kind={a.kind} archived={!!a.archivedAt} />

      <Section title="History">
        {items.length ? (
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {items.map((it) => it.type === 'snap' ? (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">Updated to <span className="num">{inr(it.value, { decimals: 'never' })}</span></span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {shortDate(it.date)}{!isLoan && <> · {inr(it.invested, { decimals: 'never' })} put in</>}{it.source !== 'manual' ? ` · via ${it.source}` : ''}{it.note ? ` · ${it.note}` : ''}
                  </span>
                </span>
                <DeleteSnapshotButton id={it.id} />
              </div>
            ) : (
              <Link key={it.id} href={`/expense/${it.id}?back=/wealth/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-sunken">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{it.description}</span>
                  <span className="block text-[12.5px] text-muted">{shortDate(it.date)} · logged investment</span>
                </span>
                <span className="num text-[14.5px] font-medium text-invest">+{inr(it.amount, { decimals: 'never' })}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="card px-4 py-6 text-center text-[14px] text-muted">No history yet.</p>
        )}
      </Section>
    </div>
  )
}
