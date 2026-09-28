import { requireUserId } from '@/lib/queries'
import { netWorth, kindMeta } from '@/lib/wealth'
import { PageHeader } from '@/components/kit'
import { UpdateForm } from '@/components/wealth-client'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Update values' }

export default async function UpdatePage() {
  const userId = await requireUserId()
  const nw = await netWorth(userId)
  const rows = nw.accounts.filter((a) => !a.archived).map((a) => ({
    id: a.id, name: a.name, kind: a.kind, kindLabel: kindMeta(a.kind).label, emoji: kindMeta(a.kind).emoji,
    invested: a.invested, value: a.value, isLoan: a.isLoan, flat: a.kind === 'bank',
  }))
  if (!rows.length) redirect('/wealth')
  return (
    <div>
      <PageHeader title="Update values" back="/wealth" subtitle="Last numbers are filled in — change only what moved." />
      <UpdateForm rows={rows} />
    </div>
  )
}
