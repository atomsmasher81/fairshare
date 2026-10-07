import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { groupStats, requireUserId } from '@/lib/queries'
import { inr, inrShort, categoryMeta, istDay, dayLabel } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/kit'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Group spending' }

function Bar({ value, total, color }: { value: number; total: number; color?: string }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full" style={{ width: `${total ? Math.max(1.5, (value / total) * 100) : 0}%`, background: color || 'rgb(var(--fg) / 0.55)' }} />
    </div>
  )
}

export default async function GroupInsightsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const sp = await searchParams
  const offset = Math.min(0, Math.max(-120, parseInt(sp.m || '0', 10) || 0))
  const group = await prisma.group.findFirst({
    where: { id, deletedAt: null, isPersonal: false, members: { some: { userId } } },
    select: { name: true, members: { orderBy: { joinedAt: 'asc' }, select: { user: { select: { id: true, displayName: true } } } } },
  })
  if (!group) notFound()
  const s = await groupStats(id, userId, offset)
  const members = group.members.map((m) => m.user)
  const name = (uid: string) => (uid === userId ? 'You' : members.find((m) => m.id === uid)?.displayName.split(' ')[0] || 'Someone')
  const href = (m: number) => `/groups/${id}/insights${m ? `?m=${m}` : ''}`
  const max = Math.max(...s.bars.map((b) => b.total), 1)
  const diff = s.total - s.prevTotal
  const pct = s.prevTotal ? Math.round((diff / s.prevTotal) * 100) : null
  const people = members
    .map((m) => ({ id: m.id, paid: s.paid.get(m.id) || 0, used: s.used.get(m.id) || 0 }))
    .filter((p) => p.paid || p.used)
    .sort((a, b) => b.used - a.used)

  return (
    <div className="space-y-5">
      <PageHeader back={`/groups/${id}`} title={group.name} subtitle="Spending, month by month" />

      {/* Month switcher */}
      <div className="flex items-center justify-between px-1">
        <Link href={href(offset - 1)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Previous month"><ChevronLeft size={20} /></Link>
        <span className="text-[15px] font-semibold">{s.month.longLabel}</span>
        {offset < 0
          ? <Link href={href(offset + 1)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Next month"><ChevronRight size={20} /></Link>
          : <span className="h-9 w-9" />}
      </div>

      <div className="card p-5">
        <p className="text-[14px] text-muted">The group spent{s.partial ? ' so far' : ''}</p>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-0.045em]">{inr(s.total, { decimals: 'never' })}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          {s.prevTotal > 0 && (
            <span>
              <span className={cn('font-medium', diff > 0 ? 'text-neg' : 'text-pos')}>{diff > 0 ? '▲' : '▼'} {inr(Math.abs(diff), { decimals: 'never' })}{pct !== null && ` (${Math.abs(pct)}%)`}</span> vs {s.partial ? `same days of ${s.prevLabel}` : s.prevLabel}
            </span>
          )}
          <span>{s.count} expense{s.count === 1 ? '' : 's'}</span>
          <span>Your share <span className="num font-medium text-fg">{inr(s.mine, { decimals: 'never' })}</span></span>
        </div>

        {/* Last 6 months */}
        <div className="mt-5 flex h-28 items-end gap-2 border-t border-line/[0.07] pt-4">
          {s.bars.map((b) => {
            const on = b.offset === offset
            return (
              <Link key={b.offset} href={href(b.offset)} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${b.label}: ${inr(b.total)}`}>
                <span className={cn('num text-[10.5px]', on ? 'font-semibold text-fg' : 'text-faint')}>{b.total ? inrShort(b.total) : ''}</span>
                <span className="relative w-full max-w-9 overflow-hidden rounded-md bg-sunken" style={{ height: `${Math.max(4, (b.total / max) * 100)}%` }}>
                  <span className={cn('absolute inset-0', on ? 'bg-fg/80' : 'bg-fg/25')} />
                  <span className="absolute inset-x-0 bottom-0 bg-invest/70" style={{ height: `${b.total ? (b.mine / b.total) * 100 : 0}%` }} />
                </span>
                <span className={cn('text-[11.5px]', on ? 'font-semibold text-fg' : 'text-muted')}>{b.label}</span>
              </Link>
            )
          })}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
          <span className="h-2 w-2 rounded-sm bg-invest/70" /> your share
          {s.avg > 0 && <span className="ml-auto">avg {inr(s.avg, { decimals: 'never' })}/month</span>}
        </p>
      </div>

      {s.count === 0 ? (
        <div className="card"><EmptyState title={`Nothing in ${s.month.label}`}>Expenses added to this group show up here.</EmptyState></div>
      ) : (
        <>
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">By category</h2>
            <div className="mt-3 space-y-3.5">
              {s.byCategory.map(([c, v]) => (
                <div key={c}>
                  <div className="flex items-baseline justify-between text-[14px]">
                    <span>{categoryMeta(c).emoji} <span className="ml-1">{categoryMeta(c).label}</span></span>
                    <span><span className="num font-medium">{inr(v, { decimals: 'never' })}</span><span className="num ml-2 inline-block w-9 text-right text-muted">{Math.round((v / s.total) * 100)}%</span></span>
                  </div>
                  <Bar value={v} total={s.total} />
                </div>
              ))}
            </div>
          </section>

          {people.length > 1 && (
            <section className="card p-5">
              <h2 className="text-[15px] font-semibold">Who paid, who used</h2>
              <p className="text-[13px] text-muted">Paid = put money down. Share = their part of the expenses.</p>
              <div className="mt-3 divide-y divide-line/[0.07]">
                {people.map((p) => {
                  const net = p.paid - p.used
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-2.5 text-[14px]">
                      <span className="font-medium">{name(p.id)}</span>
                      <span className="text-right"><span className="block text-[11.5px] text-muted">Paid</span><span className="num">{inr(p.paid, { decimals: 'never' })}</span></span>
                      <span className="w-20 text-right"><span className="block text-[11.5px] text-muted">Share</span><span className="num">{inr(p.used, { decimals: 'never' })}</span>
                        {net !== 0 && <span className={cn('num block text-[11.5px]', net > 0 ? 'text-pos' : 'text-neg')}>{net > 0 ? '+' : '−'}{inr(Math.abs(net), { decimals: 'never' })}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="px-1 text-[15px] font-semibold">Biggest</h2>
            <div className="card divide-y divide-line/[0.07] overflow-hidden">
              {s.top.map((e) => (
                <Link key={e.id} href={`/expense/${e.id}?back=${encodeURIComponent(href(offset))}`} className="flex items-center gap-3 px-4 py-3 active:bg-sunken">
                  <span className="text-[18px]">{categoryMeta(e.category).emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{e.description}</span>
                    <span className="block text-[12.5px] text-muted">{dayLabel(istDay(e.date))} · {name(e.paidById)} paid</span>
                  </span>
                  <span className="num text-[14.5px] font-medium">{inr(e.amount, { decimals: 'never' })}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
