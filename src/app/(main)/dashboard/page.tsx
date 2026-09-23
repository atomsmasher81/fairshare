import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount, getCategoryLabel } from '@/lib/utils'
import { QuickAdd } from '@/components/quick-add'
import { ReviewInbox } from '@/components/review-inbox'
import { getLedgerOptions, getRecentDescriptions, istMonthRange, ledger } from '@/lib/server-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')
  const userId = session.userId
  const { from, to, label } = istMonthRange(0)

  const [{ ledgers, defaultId }, recent, spend, friends, pending, groups] = await Promise.all([
    getLedgerOptions(userId),
    getRecentDescriptions(userId),
    ledger.mySpending(prisma, userId, from, to),
    ledger.friendBalances(prisma, userId),
    prisma.expense.findMany({
      where: { createdById: userId, needsReview: true, deletedAt: null },
      orderBy: { date: 'desc' },
      take: 20,
      select: { id: true, description: true, amount: true, date: true, payee: true },
    }),
    ledger.listSharedGroups(prisma, userId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owedToYou = friends.filter((f: any) => f.net > 0).reduce((a: number, f: any) => a + f.net, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const youOwe = friends.filter((f: any) => f.net < 0).reduce((a: number, f: any) => a - f.net, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = friends.filter((f: any) => f.net !== 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-card)]">
        <QuickAdd ledgers={ledgers} defaultId={defaultId} recent={recent} />
      </section>

      <ReviewInbox
        items={pending.map((p) => ({ ...p, date: p.date.toISOString() }))}
        ledgers={ledgers}
      />

      <section className="grid grid-cols-3 gap-3">
        <Link href="/spending" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs text-[var(--muted-foreground)]">{label.split(' ')[0]} spend</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatAmount(spend.total)}</p>
        </Link>
        <Link href="/friends" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs text-[var(--muted-foreground)]">Owed to you</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--success)]">{formatAmount(owedToYou)}</p>
        </Link>
        <Link href="/friends" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs text-[var(--muted-foreground)]">You owe</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--danger)]">{formatAmount(youOwe)}</p>
        </Link>
      </section>

      {open.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Balances</h2>
            <Link href="/friends" className="text-sm text-[var(--accent)]">Settle up →</Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {open.map((f: any) => (
              <li key={f.user.id} className="flex items-center justify-between py-2">
                <span>{f.user.displayName}</span>
                <span className={f.net > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                  {f.net > 0 ? `owes you ${formatAmount(f.net)}` : `you owe ${formatAmount(-f.net)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Recent</h2>
          <Link href="/spending" className="text-sm text-[var(--accent)]">All →</Link>
        </div>
        {spend.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">Nothing this month yet. Type “chai 20” above.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {spend.items.slice(0, 10).map((i: any) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{i.description}{i.needsReview && <span className="ml-1 text-xs text-[var(--accent)]">• unsorted</span>}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {new Date(i.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {getCategoryLabel(i.category)}
                    {!i.group.isPersonal && ` · ${i.group.name} (of ${formatAmount(i.amount)})`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{formatAmount(i.share)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Groups</h2>
          <Link href="/groups/new" className="text-sm text-[var(--accent)]">+ New group</Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {groups.map((g: any) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--border-strong)]">
              <p className="font-medium">{g.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{g.members.map((m: { user: { displayName: string } }) => m.user.displayName).join(', ')}</p>
            </Link>
          ))}
          {groups.length === 0 && (
            <Link href="/groups/new" className="rounded-2xl border border-dashed border-[var(--border-strong)] p-4 text-sm text-[var(--muted-foreground)]">
              Create a group for your flat, a trip, or a friend →
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
