import Link from 'next/link'
import { Plus } from 'lucide-react'
import { balances, groupsWithBalance, requireUserId } from '@/lib/queries'
import { inr } from '@/lib/format'
import { PageHeader } from '@/components/kit'
import { AddFriendButton } from '@/components/friends-header'
import { PeopleList, type PeopleItem } from '@/components/people-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Friends & groups' }

export default async function FriendsPage() {
  const userId = await requireUserId()
  const [bal, groups] = await Promise.all([balances(userId), groupsWithBalance(userId)])
  const items: PeopleItem[] = [
    ...bal.friends.map((f) => ({
      kind: 'friend' as const, id: f.user.id, name: f.user.displayName, net: f.net,
      sub: f.user.isPlaceholder ? 'not on FairShare yet' : f.groups.length > 1 ? `across ${f.groups.length} ledgers` : null,
    })),
    ...groups.map((g) => ({
      kind: 'group' as const, id: g.id, name: g.name, net: g.net,
      sub: `${g.members.length} ${g.members.length === 1 ? 'member' : 'members'}`,
    })),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Friends"
        action={
          <div className="flex items-center gap-2">
            <Link href="/groups/new" className="pressable flex h-10 items-center gap-1.5 rounded-full border border-line/10 bg-card px-3.5 text-[14px] font-medium">
              <Plus size={16} /> Group
            </Link>
            <AddFriendButton />
          </div>
        }
      />

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
      <p className="-mt-3 px-1 text-[12px] text-faint">Totals are per friend, across groups and one-off splits. A group’s number is your balance inside that group.</p>

      <PeopleList items={items} />
    </div>
  )
}
