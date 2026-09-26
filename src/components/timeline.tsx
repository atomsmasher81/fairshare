import Link from 'next/link'
import { Plus, Pencil, Trash2, RotateCcw, ArrowLeftRight, Users } from 'lucide-react'
import { dayLabel, istDay, inr, relativeTime } from '@/lib/format'
import type { TimelineItem } from '@/lib/queries'
import { RestoreButton, DeletePaymentButton } from '@/components/history-actions'
import { cn } from '@/lib/utils'

function Icon({ type }: { type: string }) {
  const cls = 'h-8 w-8 shrink-0 rounded-full flex items-center justify-center'
  if (type.endsWith('deleted')) return <span className={cn(cls, 'bg-danger/10 text-danger')}><Trash2 size={15} /></span>
  if (type.endsWith('restored')) return <span className={cn(cls, 'bg-pos/10 text-pos')}><RotateCcw size={15} /></span>
  if (type === 'expense_edited') return <span className={cn(cls, 'bg-semi/15 text-semi')}><Pencil size={14} /></span>
  if (type === 'settlement') return <span className={cn(cls, 'bg-sunken text-muted')}><ArrowLeftRight size={15} /></span>
  if (type === 'expense_added') return <span className={cn(cls, 'bg-sunken text-muted')}><Plus size={16} /></span>
  return <span className={cn(cls, 'bg-sunken text-muted')}><Users size={15} /></span>
}

/** Who did what, newest first, grouped by day. Deleted things can be restored right here. */
export function Timeline({ items, back }: { items: TimelineItem[]; back?: string }) {
  // Only the newest event for an item gets the Restore / Undo button
  const seen = new Set<string>()
  const latest = new Set<string>()
  for (const it of items) {
    if (it.target && !seen.has(it.target.id)) { seen.add(it.target.id); latest.add(it.id) }
  }
  const days = new Map<string, TimelineItem[]>()
  for (const it of items) {
    const d = istDay(it.at)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(it)
  }
  return (
    <div className="space-y-4">
      {Array.from(days.entries()).map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-muted">{dayLabel(day)}</h2>
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {list.map((it) => <TimelineRow key={it.id} it={it} back={back} actionable={latest.has(it.id)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function TimelineRow({ it, back, actionable }: { it: TimelineItem; back?: string; actionable: boolean }) {
  const t = it.target
  const href = t && t.exists
    ? t.kind === 'expense' ? `/expense/${t.id}${back ? `?back=${encodeURIComponent(back)}` : ''}` : `/payment/${t.id}`
    : undefined
  const action = t && t.exists && actionable
    ? t.deleted && (it.type.endsWith('deleted'))
      ? <RestoreButton kind={t.kind} id={t.id} />
      : !t.deleted && it.type === 'settlement'
        ? <DeletePaymentButton id={t.id} />
        : null
    : null

  const body = (
    <>
      <Icon type={it.type} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] leading-snug">
          <span className="font-semibold">{it.actor}</span> {it.verb}{' '}
          <span className={cn('font-medium', t?.deleted && it.type.startsWith('expense') && 'line-through decoration-faint')}>{it.subject}</span>
          {it.amount != null && <span className="num text-muted"> · {inr(it.amount)}</span>}
        </p>
        <p className="text-[12.5px] text-muted">{it.where} · {relativeTime(it.at)}</p>
        {it.changes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[12.5px]">
            {it.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap gap-x-1.5">
                <span className="text-muted">{c.field}:</span>
                <span className="text-faint line-through">{c.from}</span>
                <span>→ {c.to}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {action}
    </>
  )
  const cls = 'flex items-start gap-3 px-4 py-3'
  return href && !action
    ? <Link href={href} className={cn(cls, 'hover:bg-fg/[0.025]')}>{body}</Link>
    : <div className={cls}>{body}</div>
}
