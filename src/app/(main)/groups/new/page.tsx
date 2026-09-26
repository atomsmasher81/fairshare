import { NewGroupForm } from '@/components/new-group-form'
import { PageHeader } from '@/components/kit'
import { editorOptions, requireUserId } from '@/lib/queries'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New group' }

export default async function NewGroupPage() {
  const userId = await requireUserId()
  const { friends } = await editorOptions(userId)
  return (
    <div>
      <PageHeader back="/friends?tab=groups" title="New group" subtitle="For a flat, a trip, an office lunch crew…" />
      <NewGroupForm friends={friends} />
    </div>
  )
}
