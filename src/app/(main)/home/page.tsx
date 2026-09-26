import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { balances, entriesFor, monthRange, pendingReview, requireUserId, summarize, ledger } from '@/lib/queries'
import { inr, inrShort, NEEDS, NEED_META } from '@/lib/format'
import { EntryRow } from '@/components/entry-row'
import { SayIt } from '@/components/say-it'
import { ReviewInbox } from '@/components/review-inbox'
import { EmptyState, Section } from '@/components/kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Home' }

function greeting() {
  const h = new Date(Date.now() + 5.5 * 3600e3).getUTCHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default async function HomePage() {
  const userId = await requireUserId()
  const month = monthRange(0)
  const [me, entries, bal, pending, methods] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    entriesFor(userId, month.from, month.to),
    balances(userId),
    pendingReview(userId),
    ledger.listPaymentMethods(prisma, userId) as Promise<{ id: string; name: string }[]>,
  ])
  const sum = summarize(entries, month.dayOfMonth || month.daysInMonth)
  const recent = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6)
  const needTotal = NEEDS.reduce((a, n) => a + sum.byNeed[n], 0) + sum.byNeed.unset
  const daysLeft = month.daysInMonth - (month.dayOfMonth || 0)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between px-1">
        <div>
          <p className="text-[14px] text-muted">{greeting()},</p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{me?.displayName.split(' ')[0]}</h1>
        </div>
      </header>

      {/* This month */}
      <Link href="/activity?view=summary" className="card block p-5 transition-transform active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">Spent in {month.label}</p>
          <ChevronRight size={18} className="text-faint" />
        </div>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-0.045em]">{inr(sum.spent, { decimals: 'never' })}</p>

        {needTotal > 0 && (
          <>
            <div className="mt-5 flex h-2 gap-[3px] overflow-hidden rounded-full">
              {NEEDS.map((n) => sum.byNeed[n] > 0 && (
                <span key={n} style={{ width: `${(sum.byNeed[n] / needTotal) * 100}%`, background: NEED_META[n].color }} />
              ))}
              {sum.byNeed.unset > 0 && <span className="bg-fg/15" style={{ width: `${(sum.byNeed.unset / needTotal) * 100}%` }} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {NEEDS.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: NEED_META[n].color }} />
                  {NEED_META[n].short} <span className="num font-medium text-fg">{inrShort(sum.byNeed[n])}</span>
                </span>
              ))}
            </div>
          </>
        )}
        {month.dayOfMonth && sum.spent > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            {inr(sum.dailyAvg, { decimals: 'never' })} a day on average · {daysLeft === 0 ? 'last day of the month' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </p>
        )}
      </Link>

      {/* Balances */}
      <Link href="/friends" className="card grid grid-cols-2 divide-x divide-line/[0.07] transition-transform active:scale-[0.99]">
        {bal.owed === 0 && bal.owe === 0 ? (
          <div className="col-span-2 flex items-center justify-between p-5">
            <div>
              <p className="text-[14px] text-muted">Friends</p>
              <p className="mt-0.5 text-[17px] font-semibold">{bal.friends.length ? 'All settled up' : 'Split a bill with someone'}</p>
            </div>
            <ChevronRight size={18} className="text-faint" />
          </div>
        ) : (
          <>
            <div className="p-5">
              <p className="text-[14px] text-muted">You’re owed</p>
              <p className={`num mt-1 text-[24px] font-semibold tracking-[-0.03em] ${bal.owed ? 'text-pos' : 'text-faint'}`}>{inr(bal.owed)}</p>
            </div>
            <div className="p-5">
              <p className="text-[14px] text-muted">You owe</p>
              <p className={`num mt-1 text-[24px] font-semibold tracking-[-0.03em] ${bal.owe ? 'text-neg' : 'text-faint'}`}>{inr(bal.owe)}</p>
            </div>
          </>
        )}
      </Link>

      <SayIt methods={methods} />

      <ReviewInbox items={pending.map((p) => ({ ...p, date: p.date.toISOString() }))} />

      <Section title="Recent" action={recent.length > 0 && <Link href="/activity" className="text-[14px] text-muted hover:text-fg">See all</Link>}>
        {recent.length ? (
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {recent.map((e) => <EntryRow key={e.id} e={e} back="/home" />)}
          </div>
        ) : (
          <div className="card">
            <EmptyState title="Nothing yet this month">
              Tap <b>+</b>, or type <span className="font-medium text-fg">“chai 20”</span> above.
            </EmptyState>
          </div>
        )}
      </Section>
    </div>
  )
}
