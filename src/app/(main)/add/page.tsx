import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { QuickAdd } from '@/components/quick-add'
import { getLedgerOptions, getRecentDescriptions } from '@/lib/server-data'

export const dynamic = 'force-dynamic'

export default async function AddPage() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')
  const userId = session.userId
  const [{ ledgers, defaultId }, recent] = await Promise.all([getLedgerOptions(userId), getRecentDescriptions(userId, 12)])
  const shared = ledgers.filter((l) => l.id)

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Add expense</h1>
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-card)]">
        <QuickAdd ledgers={ledgers} defaultId={defaultId} recent={recent} autoFocus />
      </div>
      <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
        <p><b>Tips</b> — amount can go first or last: <code>20 milk</code>, <code>milk 20</code>, <code>rent 30,390</code></p>
        <p><code>@groupname</code> splits it equally in that group, <code>#me</code> keeps it personal.</p>
        <p>Paste a whole bank SMS here and it’ll read the amount &amp; payee.</p>
      </div>
      {shared.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Need unequal split or someone else paid?</p>
          <div className="flex flex-wrap gap-2">
            {shared.map((l) => (
              <Link key={l.id} href={`/groups/${l.id}/add`} className="rounded-full border border-[var(--border)] px-3 py-1 text-sm">
                Detailed add in {l.name} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
