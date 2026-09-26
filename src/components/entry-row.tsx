import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import { inr, categoryMeta, NEED_META, type Need } from '@/lib/format'
import type { Entry } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { RestoreButton } from '@/components/history-actions'

/**
 * One expense or payment, always from *your* side: what it cost you on the right,
 * and how it moved your balance with friends underneath.
 */
export function EntryRow({ e, back, showLedger = true }: { e: Entry; back?: string; showLedger?: boolean }) {
  const href = e.kind === 'expense' ? `/expense/${e.id}${back ? `?back=${encodeURIComponent(back)}` : ''}` : `/payment/${e.id}`
  const need = e.needLevel as Need | null

  const meta: React.ReactNode[] = []
  if (e.kind === 'payment') {
    meta.push(e.ledger.kind === 'group' ? e.ledger.name : 'Settle up')
  } else if (e.ledger.kind === 'personal') {
    if (need) meta.push(<span key="n" className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: NEED_META[need].color }} />{NEED_META[need].short}</span>)
    if (e.method) meta.push(e.method)
    if (!need && !e.method) meta.push(categoryMeta(e.category).label)
  } else {
    meta.push(`${e.iPaid ? 'You' : e.paidByName.split(' ')[0]} paid ${inr(e.amount)}`)
    if (showLedger) meta.push(e.ledger.kind === 'group' ? e.ledger.name : `with ${e.people.map((p) => p.split(' ')[0]).join(', ')}`)
  }

  if (e.deleted) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-70">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunken text-[18px] grayscale">
          {e.kind === 'payment' ? <ArrowLeftRight size={17} className="text-muted" /> : categoryMeta(e.category).emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-muted line-through decoration-faint">{e.description}</span>
          <span className="block truncate text-[12.5px] text-danger">Deleted{e.deleted.by ? ` by ${e.deleted.by}` : ''} · {inr(e.amount)}</span>
        </span>
        <RestoreButton kind={e.kind === 'payment' ? 'payment' : 'expense'} id={e.id} />
      </div>
    )
  }

  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunken text-[18px]">
        {e.kind === 'payment' ? <ArrowLeftRight size={17} className="text-muted" /> : categoryMeta(e.category).emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium">{e.description}</span>
          {e.needsReview && <span className="shrink-0 rounded-full bg-neg/15 px-1.5 text-[11px] font-medium text-neg">to sort</span>}
          {e.edited && <span className="shrink-0 text-[11px] text-faint">edited</span>}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[13px] text-muted">
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5">{i > 0 && <span className="text-faint">·</span>}{m}</span>
          ))}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {e.kind === 'payment' ? (
          <>
            <span className={cn('num block text-[15px] font-medium', e.impact < 0 ? 'text-pos' : e.impact === 0 && 'text-muted')}>{inr(e.amount)}</span>
            <span className="block text-[12px] text-muted">{e.impact === 0 ? 'payment' : e.iPaid ? 'paid' : 'received'}</span>
          </>
        ) : e.share === 0 && e.impact === 0 && e.ledger.kind !== 'personal' ? (
          <>
            <span className="num block text-[15px] text-muted">{inr(e.amount)}</span>
            <span className="block text-[12px] text-faint">not involved</span>
          </>
        ) : (
          <>
            <span className={cn('num block text-[15px] font-medium', !e.share && 'text-muted')}>{inr(e.share)}</span>
            {e.impact !== 0 && (
              <span className={cn('num block text-[12px]', e.impact > 0 ? 'text-pos' : 'text-neg')}>
                {e.impact > 0 ? 'lent ' : 'borrowed '}{inr(Math.abs(e.impact))}
              </span>
            )}
          </>
        )}
      </span>
    </>
  )

  const cls = 'flex items-center gap-3 px-4 py-3 transition-colors'
  return <Link href={href} className={cn(cls, 'hover:bg-fg/[0.025] active:bg-fg/[0.05]')}>{body}</Link>
}
