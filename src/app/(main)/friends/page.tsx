import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { balances, groupsWithBalance, requireUserId } from '@/lib/queries'
import { inr } from '@/lib/format'
import { Avatar, BalanceLine, EmptyState, PageHeader } from '@/components/kit'
import { AddFriendButton } from '@/components/friends-header'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Friends' }

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const userId = await requireUserId()
  const tab = (await searchParams).tab === 'groups' ? 'groups' : 'friends'
  const [bal, groups] = await Promise.all([balances(userId), groupsWithBalance(userId)])
  const friends = [...bal.friends].sort((a, b) =>
    (b.net !== 0 ? 1 : 0) - (a.net !== 0 ? 1 : 0) || Math.abs(b.net) - Math.abs(a.net) || a.user.displayName.localeCompare(b.user.displayName))

  return (
    <div className="space-y-5">
      <PageHeader title="Friends" action={<AddFriendButton />} />

      <div className="card grid grid-cols-2 divide-x divide-line/[0.07]">
        <div className="p-4">
          <p className="text-[13px] text-muted">You’re owed</p>
          <p className={`num mt-0.5 text-[22px] font-semibold tracking-[-0.03em] ${bal.owed ? 'text-pos' : 'text-faint'}`}>{inr(bal.owed)}</p>
        </div>
        <div className="p-4">
          <p className="text-[13px] text-muted">You owe</p>
          <p className={`num mt-0.5 text-[22px] font-semibold tracking-[-0.03em] ${bal.owe ? 'text-neg' : 'text-faint'}`}>{inr(bal.owe)}</p>
        </div>
      </div>

      <div className="flex rounded-2xl bg-sunken p-1">
        {(['friends', 'groups'] as const).map((t) => (
          <Link key={t} href={t === 'groups' ? '/friends?tab=groups' : '/friends'} replace
            className={cn('flex h-9 flex-1 items-center justify-center rounded-xl text-[14px] font-medium capitalize transition',
              tab === t ? 'bg-raised text-fg shadow-[var(--shadow-soft)]' : 'text-muted')}>
            {t}
          </Link>
        ))}
      </div>

      {tab === 'friends' ? (
        friends.length ? (
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {friends.map((f) => (
              <Link key={f.user.id} href={`/friends/${f.user.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fg/[0.025] active:bg-fg/[0.05]">
                <Avatar name={f.user.displayName} id={f.user.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.user.displayName}</p>
                  {f.user.isPlaceholder && <p className="text-[12.5px] text-faint">Not on FairShare yet</p>}
                  {!f.user.isPlaceholder && f.groups.length > 1 && (
                    <p className="truncate text-[12.5px] text-muted">across {f.groups.length} ledgers</p>
                  )}
                </div>
                <BalanceLine net={f.net} className="text-right text-[14px]" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<Users size={28} />} title="No friends yet">
              Add someone by name — they don’t need an account — and start splitting.
            </EmptyState>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {groups.length > 0 && (
            <div className="card divide-y divide-line/[0.07] overflow-hidden">
              {groups.map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fg/[0.025] active:bg-fg/[0.05]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunken text-[15px] font-semibold text-muted">
                    {g.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="truncate text-[12.5px] text-muted">{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</p>
                  </div>
                  {g.net === 0 ? <span className="text-[14px] text-muted">settled up</span> : (
                    <span className={cn('text-right text-[14px]', g.net > 0 ? 'text-pos' : 'text-neg')}>
                      {g.net > 0 ? 'you’re owed ' : 'you owe '}<span className="num font-semibold">{inr(Math.abs(g.net))}</span>
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
          <Link href="/groups/new" className="card flex items-center gap-3 px-4 py-3.5 text-muted hover:text-fg">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-dashed border-line/25"><Plus size={18} /></span>
            <span className="font-medium">New group</span>
            <span className="ml-auto text-[13px] text-faint">flat, trip, office…</span>
          </Link>
        </div>
      )}
    </div>
  )
}
