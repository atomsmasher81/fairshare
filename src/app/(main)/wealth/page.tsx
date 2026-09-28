import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { requireUserId } from '@/lib/queries'
import { netWorth, kindMeta, type AccountView } from '@/lib/wealth'
import { inr, shortDate } from '@/lib/format'
import { PageHeader, Section } from '@/components/kit'
import { AddAccountButton, StarterChips } from '@/components/wealth-client'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Net worth' }

function Signed({ paise, className }: { paise: number; className?: string }) {
  return (
    <span className={cn('num', paise > 0 ? 'text-pos' : paise < 0 ? 'text-neg' : 'text-muted', className)}>
      {paise > 0 ? '+' : paise < 0 ? '−' : ''}{inr(Math.abs(paise), { decimals: 'never' })}
    </span>
  )
}

function AccountRow({ a }: { a: AccountView }) {
  const m = kindMeta(a.kind)
  return (
    <Link href={`/wealth/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-sunken">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-[18px]">{m.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block truncate text-[13px] text-muted">
          {a.isLoan ? 'Loan' : a.invested > 0 && a.invested !== a.value ? <>{inr(a.invested, { decimals: 'never' })} in</> : m.label}
          {a.updatedAt && <> · {shortDate(a.updatedAt)}</>}
        </span>
      </span>
      <span className="text-right">
        <span className={cn('num block font-semibold', a.isLoan && 'text-neg')}>{a.isLoan ? '−' : ''}{inr(a.value, { decimals: 'never' })}</span>
        {!a.isLoan && a.gainPct !== null && a.gain !== 0 && (
          <span className={cn('num block text-[12.5px]', a.gain > 0 ? 'text-pos' : 'text-neg')}>{a.gain > 0 ? '+' : ''}{a.gainPct.toFixed(1)}%</span>
        )}
      </span>
    </Link>
  )
}

export default async function WealthPage() {
  const userId = await requireUserId()
  const nw = await netWorth(userId)
  const live = nw.accounts.filter((a) => !a.archived)

  if (!live.length) {
    return (
      <div>
        <PageHeader title="Net worth" back="/settings" />
        <div className="card px-6 py-10 text-center">
          <p className="text-[34px]">🌱</p>
          <p className="mt-2 text-[17px] font-semibold">Track what you own</p>
          <p className="mx-auto mt-1 max-w-xs text-[14px] text-muted">
            Add your savings, funds, PPF, FDs — whatever you have. Update the numbers once a month and see where you stand.
          </p>
          <div className="mt-6"><StarterChips /></div>
          <div className="mt-4"><AddAccountButton big /></div>
        </div>
      </div>
    )
  }

  const assets = live.filter((a) => !a.isLoan).sort((a, b) => b.value - a.value)
  const loans = live.filter((a) => a.isLoan)
  const stale = nw.lastUpdate && Date.now() - new Date(nw.lastUpdate).getTime() > 35 * 864e5

  return (
    <div className="space-y-6">
      <PageHeader title="Net worth" back="/settings" />

      <div className="card p-5">
        <p className="text-[14px] text-muted">You’re worth</p>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-0.045em]">{nw.total < 0 ? '−' : ''}{inr(Math.abs(nw.total), { decimals: 'never' })}</p>
        {nw.changeThisMonth !== null && nw.changeThisMonth !== 0 && (
          <p className="mt-2 text-[14px] text-muted"><Signed paise={nw.changeThisMonth} className="font-medium" /> this month</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line/[0.07] pt-4">
          <div>
            <p className="text-[13px] text-muted">Put in</p>
            <p className="num mt-0.5 text-[17px] font-semibold">{inr(nw.invested, { decimals: 'never' })}</p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Returns</p>
            <p className="mt-0.5 text-[17px] font-semibold">
              <Signed paise={nw.gain} />
              {nw.gainPct !== null && nw.gain !== 0 && <span className="num ml-1.5 text-[13px] font-normal text-muted">{nw.gainPct > 0 ? '+' : ''}{nw.gainPct.toFixed(1)}%</span>}
            </p>
          </div>
        </div>
        {nw.loans > 0 && <p className="mt-3 text-[13px] text-muted">{inr(nw.assets, { decimals: 'never' })} in assets − {inr(nw.loans, { decimals: 'never' })} in loans</p>}
      </div>

      <div className="flex gap-2">
        <Link href="/wealth/update" className="pressable inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-2xl bg-fg px-5 font-medium text-bg">
          <RefreshCw size={16} /> Update values
        </Link>
        <AddAccountButton />
      </div>
      {nw.lastUpdate && (
        <p className={cn('-mt-3 px-1 text-[13px]', stale ? 'text-neg' : 'text-muted')}>
          Last updated {shortDate(nw.lastUpdate)}{stale ? ' — time for a monthly update' : ''}
        </p>
      )}

      <Section title="Accounts">
        <div className="card divide-y divide-line/[0.07] overflow-hidden">
          {assets.map((a) => <AccountRow key={a.id} a={a} />)}
        </div>
      </Section>

      {loans.length > 0 && (
        <Section title="Loans">
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {loans.map((a) => <AccountRow key={a.id} a={a} />)}
          </div>
        </Section>
      )}

      <p className="px-1 text-center text-[12.5px] leading-relaxed text-muted">
        Investments you log (type “Invest”) are added to their account automatically.
        {' '}You can also hand a screenshot to Claude through the <Link href="/settings#mcp" className="underline">MCP</Link> to update everything at once.
      </p>
    </div>
  )
}
