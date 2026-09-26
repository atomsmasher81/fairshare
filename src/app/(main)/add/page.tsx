import { ExpenseEditor } from '@/components/expense-editor'
import { editorOptions, requireUserId } from '@/lib/queries'
import { todayKey } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add expense' }

export default async function AddPage({ searchParams }: { searchParams: Promise<{ friend?: string; group?: string; draft?: string }> }) {
  const userId = await requireUserId()
  const sp = await searchParams
  const options = await editorOptions(userId)
  const friend = sp.friend && options.friends.some((f) => f.id === sp.friend) ? sp.friend : null
  const group = sp.group && options.groups.some((g) => g.id === sp.group) ? sp.group : null
  const back = friend ? `/friends/${friend}` : group ? `/groups/${group}` : '/home'

  return (
    <ExpenseEditor
      options={options}
      backHref={back}
      fromDraft={sp.draft === '1'}
      initial={{
        description: '',
        amount: 0,
        needLevel: null,
        paymentMethodId: options.lastMethodId,
        date: todayKey(),
        target: group ? { type: 'group', id: group } : friend ? { type: 'friends', ids: [friend] } : { type: 'personal' },
        paidById: userId,
        splitMode: 'equal',
        participants: null,
        splits: null,
      }}
    />
  )
}
