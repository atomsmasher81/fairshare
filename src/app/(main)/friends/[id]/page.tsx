import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { balances, entriesFor, requireUserId, ledger } from '@/lib/queries'
import { inr } from '@/lib/format'
import { Avatar, EmptyState, PageHeader } from '@/components/kit'
import { EntryRow } from '@/components/entry-row'
import { Remind, SettleUp, ShareLink } from '@/components/settle'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const u = await prisma.user.findUnique({ where: { id: (await params).id }, select: { displayName: true } })
  return { title: u?.displayName || 'Friend' }
}

export default async function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const [bal, me, methods] = await Promise.all([
    balances(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { upiId: true } }),
    ledger.listPaymentMethods(prisma, userId) as Promise<{ id: string; name: string }[]>,
  ])
  const f = bal.friends.find((x) => x.user.id === id)
  if (!f) notFound()
  const friend = await prisma.user.findUnique({ where: { id }, select: { claimCode: true, isPlaceholder: true, addedById: true } })
  const entries = await entriesFor(userId, undefined, undefined, { friendId: id, take: 100 })
  const first = f.user.displayName.split(' ')[0]
  const back = `/friends/${id}`

  return (
    <div className="space-y-5">
      <PageHeader back="/friends" title="" />

      <div className="-mt-4 flex flex-col items-center text-center">
        <Avatar name={f.user.displayName} id={id} size={72} />
        <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.03em]">{f.user.displayName}</h1>
        {!f.user.isPlaceholder && <p className="text-[13px] text-muted">@{f.user.username}</p>}
        <p className={cn('mt-4 text-[17px]', f.net > 0 ? 'text-pos' : f.net < 0 ? 'text-neg' : 'text-muted')}>
          {f.net > 0 ? <>{first} owes you <b className="num font-semibold">{inr(f.net)}</b></>
            : f.net < 0 ? <>You owe {first} <b className="num font-semibold">{inr(-f.net)}</b></>
            : 'All settled up'}
        </p>
        {f.groups.length > 1 && (
          <p className="mt-1 text-[13px] text-muted">
            {f.groups.map((g) => `${g.name} ${g.net > 0 ? '+' : '−'}${inr(Math.abs(g.net))}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {f.net !== 0 && (
          <SettleUp friend={{ id, name: f.user.displayName, upiId: f.user.upiId }} net={f.net} methods={methods} className="flex-1" />
        )}
        {f.net > 0 && <Remind name={f.user.displayName} amount={f.net} myUpi={me?.upiId || null} />}
        <Link href={`/add?friend=${id}`} className={cn('pressable inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-medium',
          f.net === 0 ? 'bg-ink text-ink-fg' : 'border border-line/10 bg-card')}>
          <Plus size={18} /> Expense
        </Link>
      </div>
      {f.net < 0 && !f.user.upiId && (
        <p className="-mt-2 text-center text-[12.5px] text-muted">Ask {first} to add their UPI ID in FairShare for one-tap payments.</p>
      )}

      {friend?.isPlaceholder && friend.claimCode && friend.addedById === userId && (
        <div className="card p-4">
          <p className="font-medium">{first} isn’t on FairShare</p>
          <p className="mt-0.5 text-[13.5px] text-muted">Send this link so they can see what’s shared and add expenses too. Everything you’ve logged moves over.</p>
          <ShareLink className="mt-3" url={`/claim/${friend.claimCode}`} title="FairShare" text={`${first}, here’s our shared tab on FairShare`} />
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[15px] font-semibold">History</h2>
        {entries.length ? (
          <div className="card divide-y divide-line/[0.07] overflow-hidden">
            {entries.map((e) => <EntryRow key={e.id} e={e} back={back} />)}
          </div>
        ) : (
          <div className="card"><EmptyState title="Nothing shared yet">Add an expense with {first} and it shows up here.</EmptyState></div>
        )}
      </section>
    </div>
  )
}
