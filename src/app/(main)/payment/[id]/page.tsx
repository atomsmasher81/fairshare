import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUserId, timeline } from '@/lib/queries'
import { inr, dayLabel, istDay } from '@/lib/format'
import { PageHeader } from '@/components/kit'
import { Timeline } from '@/components/timeline'
import { DeletePaymentButton, RestoreButton } from '@/components/history-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payment' }

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const s = await prisma.settlement.findFirst({
    where: { id, group: { deletedAt: null, members: { some: { userId } } } },
    include: {
      fromUser: { select: { id: true, displayName: true } },
      toUser: { select: { id: true, displayName: true } },
      group: { select: { name: true, isDirect: true } },
    },
  })
  if (!s) notFound()
  const name = (u: { id: string; displayName: string }, obj = false) => (u.id === userId ? (obj ? 'you' : 'You') : u.displayName)
  const [recorder, deleter, history] = await Promise.all([
    s.createdById ? prisma.user.findUnique({ where: { id: s.createdById }, select: { id: true, displayName: true } }) : null,
    s.deletedById ? prisma.user.findUnique({ where: { id: s.deletedById }, select: { id: true, displayName: true } }) : null,
    timeline(userId, { settlementId: id, take: 30 }),
  ])
  const back = s.fromUserId === userId ? `/friends/${s.toUserId}` : s.toUserId === userId ? `/friends/${s.fromUserId}` : '/activity?view=timeline'

  return (
    <div className="space-y-5">
      <PageHeader back={back} title={`${name(s.fromUser)} paid ${name(s.toUser, true)}`} subtitle={`${dayLabel(istDay(s.date))}${s.group.isDirect ? '' : ` · ${s.group.name}`}`} />
      <div className="card p-5">
        <p className={`num text-[36px] font-semibold tracking-[-0.04em] ${s.deletedAt ? 'text-muted line-through' : ''}`}>{inr(s.amount)}</p>
        <p className="mt-1 text-[13px] text-muted">
          {recorder ? `Recorded by ${name(recorder)}` : 'Recorded'} · {dayLabel(istDay(s.createdAt))}
        </p>
        <div className="mt-4 flex items-center gap-3 border-t border-line/[0.07] pt-4">
          {s.deletedAt ? (
            <>
              <p className="flex-1 text-[14px]"><span className="font-medium text-danger">Deleted</span>{deleter ? ` by ${name(deleter, true)}` : ''} — it doesn’t count toward balances.</p>
              <RestoreButton kind="payment" id={s.id} />
            </>
          ) : (
            <>
              <p className="flex-1 text-[13.5px] text-muted">Recorded by mistake? Delete it — you can restore it later.</p>
              <DeletePaymentButton id={s.id} label="Delete" />
            </>
          )}
        </div>
      </div>
      {history.items.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[15px] font-semibold">History</h2>
          <Timeline items={history.items} />
        </section>
      )}
    </div>
  )
}
