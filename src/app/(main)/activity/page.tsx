import Link from 'next/link'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { entriesFor, monthRange, requireUserId, summarize, type Entry } from '@/lib/queries'
import { inr, dayLabel, istDay, NEEDS, NEED_META, categoryMeta, type Need } from '@/lib/format'
import { EntryRow } from '@/components/entry-row'
import { EmptyState } from '@/components/kit'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Activity' }

type SP = { m?: string; view?: string; scope?: string; need?: string; cat?: string; method?: string }

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const userId = await requireUserId()
  const sp = await searchParams
  const offset = Math.min(0, Math.max(-120, Number.parseInt(sp.m || '0', 10) || 0))
  const view = sp.view === 'summary' ? 'summary' : 'list'
  const month = monthRange(offset)
  const prev = monthRange(offset - 1)
  const [entries, prevEntries] = await Promise.all([
    entriesFor(userId, month.from, month.to),
    view === 'summary' ? entriesFor(userId, prev.from, prev.to) : Promise.resolve([] as Entry[]),
  ])
  const sum = summarize(entries, month.dayOfMonth || month.daysInMonth)

  const href = (patch: Partial<SP>) => {
    const q = new URLSearchParams()
    const next = { m: String(offset), view, scope: sp.scope, need: sp.need, cat: sp.cat, method: sp.method, ...patch }
    for (const [k, v] of Object.entries(next)) if (v && !(k === 'm' && v === '0') && !(k === 'view' && v === 'list')) q.set(k, v)
    const s = q.toString()
    return `/activity${s ? `?${s}` : ''}`
  }
  const back = href({})

  return (
    <div className="space-y-5">
      {/* month switcher */}
      <div className="flex items-center justify-between">
        <Link href={href({ m: String(offset - 1) })} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Previous month">
          <ChevronLeft size={22} />
        </Link>
        <div className="text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em]">{month.label}</h1>
          <p className="text-[12px] text-muted">{month.longLabel.split(' ')[1]}</p>
        </div>
        {offset < 0 ? (
          <Link href={href({ m: String(offset + 1) })} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Next month">
            <ChevronRight size={22} />
          </Link>
        ) : <span className="w-10" />}
      </div>

      <div className="flex rounded-2xl bg-sunken p-1">
        {(['list', 'summary'] as const).map((v) => (
          <Link key={v} href={href({ view: v })} replace
            className={cn('flex h-9 flex-1 items-center justify-center rounded-xl text-[14px] font-medium transition',
              view === v ? 'bg-raised text-fg shadow-[var(--shadow-soft)]' : 'text-muted')}>
            {v === 'list' ? 'Transactions' : 'Summary'}
          </Link>
        ))}
      </div>

      {view === 'summary'
        ? <Summary entries={entries} prevEntries={prevEntries} month={month} prevLabel={prev.label} sum={sum} href={href} />
        : <ListView entries={entries} sp={sp} href={href} back={back} spent={sum.spent} />}
    </div>
  )
}

function ListView({ entries, sp, href, back, spent }: { entries: Entry[]; sp: SP; href: (p: Partial<SP>) => string; back: string; spent: number }) {
  let list = entries
  if (sp.scope === 'personal') list = list.filter((e) => e.ledger.kind === 'personal')
  if (sp.scope === 'shared') list = list.filter((e) => e.ledger.kind !== 'personal')
  if (sp.need) list = list.filter((e) => (sp.need === 'unset' ? !e.needLevel && e.kind === 'expense' : e.needLevel === sp.need))
  if (sp.cat) list = list.filter((e) => e.category === sp.cat)
  if (sp.method) list = list.filter((e) => (e.method || 'Not set') === sp.method && e.iPaid)
  const filtered = !!(sp.need || sp.cat || sp.method)

  const days = new Map<string, Entry[]>()
  for (const e of list) {
    const d = istDay(e.date)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(e)
  }
  const shownTotal = list.reduce((a, e) => a + e.share, 0)

  return (
    <>
      <div className="flex items-center gap-2">
        {filtered ? (
          <Link href={href({ need: undefined, cat: undefined, method: undefined })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[14px] text-ink-fg">
            {sp.need ? (sp.need === 'unset' ? 'No type' : NEED_META[sp.need as Need]?.label) : sp.cat ? categoryMeta(sp.cat).label : sp.method}
            <X size={14} />
          </Link>
        ) : (
          (['all', 'personal', 'shared'] as const).map((s) => {
            const on = (sp.scope || 'all') === s
            return (
              <Link key={s} href={href({ scope: s === 'all' ? undefined : s })} replace
                className={cn('inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] capitalize',
                  on ? 'border-ink bg-ink text-ink-fg' : 'border-line/10 bg-card')}>
                {s}
              </Link>
            )
          })
        )}
        <span className="num ml-auto text-[14px] text-muted">{inr(filtered || sp.scope ? shownTotal : spent)}</span>
      </div>

      {list.length === 0 ? (
        <div className="card"><EmptyState title="No transactions">Nothing here for this month.</EmptyState></div>
      ) : (
        <div className="space-y-4">
          {Array.from(days.entries()).map(([day, items]) => {
            const total = items.reduce((a, e) => a + e.share, 0)
            return (
              <section key={day}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-semibold text-muted">{dayLabel(day)}</h2>
                  {total > 0 && <span className="num text-[13px] text-muted">{inr(total)}</span>}
                </div>
                <div className="card divide-y divide-line/[0.07] overflow-hidden">
                  {items.map((e) => <EntryRow key={e.id} e={e} back={back} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function Bar({ value, total, color }: { value: number; total: number; color?: string }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full" style={{ width: `${total ? Math.max(1.5, (value / total) * 100) : 0}%`, background: color || 'rgb(var(--fg) / 0.55)' }} />
    </div>
  )
}

function Summary({ entries, prevEntries, month, prevLabel, sum, href }: {
  entries: Entry[]
  prevEntries: Entry[]
  month: ReturnType<typeof monthRange>
  prevLabel: string
  sum: ReturnType<typeof summarize>
  href: (p: Partial<SP>) => string
}) {
  const prevSum = summarize(prevEntries, 30)
  const diff = sum.spent - prevSum.spent
  const pct = prevSum.spent ? Math.round((diff / prevSum.spent) * 100) : null
  const lent = entries.filter((e) => e.kind === 'expense' && e.iPaid).reduce((a, e) => a + (e.amount - e.share), 0)
  const needRows = [...NEEDS.map((n) => ({ key: n as string, label: NEED_META[n].label, color: NEED_META[n].color as string, v: sum.byNeed[n] })),
    ...(sum.byNeed.unset ? [{ key: 'unset', label: 'No type', color: 'rgb(var(--fg) / 0.2)', v: sum.byNeed.unset }] : [])]
  const back = href({})

  if (!entries.length) {
    return <div className="card"><EmptyState title={`Nothing in ${month.label}`}>Add an expense and your summary shows up here.</EmptyState></div>
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="text-[14px] text-muted">You spent</p>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-0.045em]">{inr(sum.spent, { decimals: 'never' })}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          {prevSum.spent > 0 && (
            <span>
              <span className={cn('font-medium', diff > 0 ? 'text-neg' : 'text-pos')}>{diff > 0 ? '▲' : '▼'} {inr(Math.abs(diff))}{pct !== null && ` (${Math.abs(pct)}%)`}</span> vs {prevLabel}
            </span>
          )}
          <span>{sum.count} expense{sum.count === 1 ? '' : 's'}</span>
          <span>{inr(sum.dailyAvg, { decimals: 'never' })}/day</span>
        </div>
        {lent > 0 && <p className="mt-2 text-[13px] text-muted">Plus <span className="num font-medium text-fg">{inr(lent)}</span> you paid for friends — that’s in your balances, not your spending.</p>}
      </div>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">By type</h2>
        <div className="mt-3 space-y-3.5">
          {needRows.map((r) => (
            <Link key={r.key} href={href({ view: 'list', need: r.key })} className="block">
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
                <span><span className="num font-medium">{inr(r.v)}</span><span className="num ml-2 inline-block w-9 text-right text-muted">{sum.spent ? Math.round((r.v / sum.spent) * 100) : 0}%</span></span>
              </div>
              <Bar value={r.v} total={sum.spent} color={r.color} />
            </Link>
          ))}
        </div>
      </section>

      {sum.byCategory.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">By category</h2>
          <div className="mt-3 space-y-3.5">
            {sum.byCategory.map(([c, v]) => (
              <Link key={c} href={href({ view: 'list', cat: c })} className="block">
                <div className="flex items-baseline justify-between text-[14px]">
                  <span>{categoryMeta(c).emoji} <span className="ml-1">{categoryMeta(c).label}</span></span>
                  <span className="num font-medium">{inr(v)}</span>
                </div>
                <Bar value={v} total={sum.byCategory[0][1]} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {sum.byMethod.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Paid out via</h2>
          <p className="text-[13px] text-muted">Everything you paid, including friends’ shares.</p>
          <div className="mt-3 divide-y divide-line/[0.07]">
            {sum.byMethod.map(([m, v]) => (
              <Link key={m} href={href({ view: 'list', method: m })} className="flex items-center justify-between py-2.5 text-[14px]">
                <span className={m === 'Not set' ? 'text-muted' : ''}>{m}</span>
                <span className="num font-medium">{inr(v)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sum.top.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[15px] font-semibold">Biggest expenses</h2>
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {sum.top.map((e) => <EntryRow key={e.id} e={e} back={back} />)}
          </div>
        </section>
      )}
    </div>
  )
}
