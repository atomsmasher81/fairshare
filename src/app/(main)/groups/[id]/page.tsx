import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Plus } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { entriesFor, groupLedger, requireUserId, ledger } from '@/lib/queries'
import { getSession } from '@/lib/auth'
import { inr } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/kit'
import { EntryRow } from '@/components/entry-row'
import { SettleUp } from '@/components/settle'
import { GroupMembers } from '@/components/group-manage'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const g = await prisma.group.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: g?.name || 'Group' }
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const group = await prisma.group.findFirst({
    where: { id, deletedAt: null, isPersonal: false, members: { some: { userId } } },
    select: { id: true, name: true, inviteCode: true, createdById: true, isDirect: true },
  })
  if (!group) notFound()
  const [gl, entries, methods, friends, session] = await Promise.all([
    groupLedger(id),
    entriesFor(userId, undefined, undefined, { groupId: id, everyone: true, take: 200, includeDeleted: true }),
    ledger.listPaymentMethods(prisma, userId) as Promise<{ id: string; name: string }[]>,
    ledger.listFriends(prisma, userId) as Promise<{ id: string; displayName: string }[]>,
    getSession(),
  ])
  if (!gl) notFound()
  const name = (uid: string) => (uid === userId ? 'You' : gl.members.find((m) => m.id === uid)?.displayName.split(' ')[0] || 'Someone')
  const myNet = gl.net.get(userId) || 0
  const mine = gl.transfers.filter((t) => t.from === userId || t.to === userId)
  const others = gl.transfers.filter((t) => t.from !== userId && t.to !== userId)
  const back = `/groups/${id}`

  return (
    <div className="space-y-5">
      <PageHeader
        back="/friends?tab=groups"
        title={group.name}
        subtitle={`${gl.members.length} ${gl.members.length === 1 ? 'member' : 'members'} · ${inr(gl.total)} spent in total`}
      />

      <div className="card p-5">
        <p className="text-[14px] text-muted">Your balance</p>
        <p className={cn('num mt-0.5 text-[28px] font-semibold tracking-[-0.035em]', myNet > 0 ? 'text-pos' : myNet < 0 ? 'text-neg' : '')}>
          {myNet === 0 ? 'Settled up' : `${myNet > 0 ? 'You’re owed' : 'You owe'} ${inr(Math.abs(myNet))}`}
        </p>

        {gl.transfers.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line/[0.07] pt-4">
            {[...mine, ...others].map((t) => {
              const involvesMe = t.from === userId || t.to === userId
              const friendId = t.from === userId ? t.to : t.from
              const friend = gl.members.find((m) => m.id === friendId)
              return (
                <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 text-[14px]">
                  <span className={cn('font-medium', !involvesMe && 'text-muted')}>{name(t.from)}</span>
                  <ArrowRight size={14} className="text-faint" />
                  <span className={cn('flex-1 font-medium', !involvesMe && 'text-muted')}>{name(t.to)}</span>
                  <span className={cn('num font-semibold', !involvesMe ? 'text-muted' : t.to === userId ? 'text-pos' : 'text-neg')}>{inr(t.amount)}</span>
                  {involvesMe && friend && (
                    <SettleUp
                      variant="secondary"
                      label="Settle"
                      className="h-8 rounded-xl px-3 text-[13px]"
                      friend={{ id: friend.id, name: friend.displayName, upiId: friend.upiId }}
                      net={t.to === userId ? t.amount : -t.amount}
                      methods={methods}
                      groupId={id}
                    />
                  )}
                </div>
              )
            })}
            <p className="pt-1 text-[12px] text-faint">Simplified to the fewest payments. Totals stay the same.</p>
          </div>
        )}
      </div>

      <Link href={`/add?group=${id}`} className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink font-medium text-ink-fg">
        <Plus size={18} /> Add expense
      </Link>

      <section className="space-y-2">
        <h2 className="px-1 text-[15px] font-semibold">History</h2>
        {entries.length ? (
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {entries.map((e) => <EntryRow key={e.id} e={e} back={back} showLedger={false} />)}
          </div>
        ) : (
          <div className="card"><EmptyState title="No expenses yet">Add the first one — rent, groceries, the cab from the airport.</EmptyState></div>
        )}
      </section>

      <GroupMembers
        groupId={id}
        inviteCode={group.inviteCode}
        members={gl.members.map((m) => ({ id: m.id, displayName: m.displayName, isPlaceholder: m.isPlaceholder }))}
        friends={friends.map((f) => ({ id: f.id, name: f.displayName }))}
        me={userId}
        canManage={group.createdById === userId || !!session.isAdmin}
      />
    </div>
  )
}
