import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ExpenseEditor } from '@/components/expense-editor'
import { editorOptions, requireUserId, timeline } from '@/lib/queries'
import { istDay, inr, dayLabel, type Need } from '@/lib/format'
import { PageHeader } from '@/components/kit'
import { Timeline } from '@/components/timeline'
import { RestoreButton } from '@/components/history-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit expense' }

export default async function EditExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const sp = await searchParams
  const expense = await prisma.expense.findFirst({
    where: { id, group: { deletedAt: null, members: { some: { userId } } } },
    include: { splits: true, group: { select: { id: true, isPersonal: true, isDirect: true, members: { select: { userId: true } } } } },
  })
  if (!expense) notFound()
  const history = (await timeline(userId, { expenseId: id, take: 50 })).items

  if (expense.deletedAt) {
    const by = expense.deletedById === userId ? 'you' : (await prisma.user.findUnique({ where: { id: expense.deletedById || '' }, select: { displayName: true } }))?.displayName || 'someone'
    return (
      <div className="space-y-5">
        <PageHeader back={sp.back && sp.back.startsWith('/') ? sp.back : '/activity'} title={expense.description} subtitle={`${inr(expense.amount)} · ${dayLabel(istDay(expense.date))}`} />
        <div className="card flex items-center gap-3 p-4">
          <p className="flex-1 text-[14px]"><span className="font-medium text-danger">Deleted</span> by {by} · it doesn’t count toward totals or balances.</p>
          <RestoreButton kind="expense" id={expense.id} />
        </div>
        <section className="space-y-2">
          <h2 className="px-1 text-[15px] font-semibold">History</h2>
          <Timeline items={history} />
        </section>
      </div>
    )
  }
  const options = await editorOptions(userId)

  const memberIds = expense.group.members.map((m) => m.userId)
  const target = expense.group.isPersonal
    ? ({ type: 'personal' } as const)
    : expense.group.isDirect
      ? ({ type: 'friends', ids: memberIds.filter((m) => m !== userId) } as const)
      : ({ type: 'group', id: expense.group.id } as const)

  // Make sure friends in this expense show up as chips even if the list is filtered elsewhere
  for (const s of expense.splits) {
    if (s.userId !== userId && !options.friends.some((f) => f.id === s.userId) && expense.group.isDirect) {
      const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { id: true, displayName: true } })
      if (u) options.friends.push({ id: u.id, name: u.displayName })
    }
  }

  // Work out how it was split so the editor reopens in the same mode
  const splitUserIds = expense.splits.map((s) => s.userId)
  const amounts = expense.splits.map((s) => s.amount)
  const evenish = Math.max(...amounts) - Math.min(...amounts) <= 1
  let splitMode: 'equal' | 'exact' | 'full' = 'exact'
  let participants: string[] | null = null
  if (memberIds.length <= 1) splitMode = 'equal'
  else if (evenish && !splitUserIds.includes(expense.paidById) && splitUserIds.length === memberIds.length - 1) splitMode = 'full'
  else if (evenish && splitUserIds.includes(expense.paidById)) {
    splitMode = 'equal'
    participants = splitUserIds.length === memberIds.length ? null : splitUserIds
  } else if (evenish && splitUserIds.length) {
    splitMode = 'equal'
    participants = splitUserIds
  }

  const back = sp.back && sp.back.startsWith('/') ? sp.back : '/activity'
  return (
    <ExpenseEditor
      options={options}
      backHref={back}
      history={history}
      initial={{
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        needLevel: (expense.needLevel as Need) || null,
        paymentMethodId: expense.paymentMethodId,
        date: istDay(expense.date),
        target,
        paidById: expense.paidById,
        splitMode,
        participants,
        splits: expense.splits.map((s) => ({ userId: s.userId, amount: s.amount })),
      }}
    />
  )
}
