import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount } from '@/lib/utils'
import { SettleButton } from '@/components/settle-button'
import { ledger } from '@/lib/server-data'

export const dynamic = 'force-dynamic'

export default async function FriendsPage() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')
  const userId = session.userId
  const [friends, me] = await Promise.all([
    ledger.friendBalances(prisma, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { upiId: true } }),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Friends</h1>
      {!me?.upiId && (
        <Link href="/settings" className="block rounded-2xl border border-dashed border-[var(--border-strong)] p-3 text-sm text-[var(--muted-foreground)]">
          Add your UPI ID in Settings so friends can pay you with one tap →
        </Link>
      )}
      {friends.length === 0 && (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-[var(--muted-foreground)]">
          No friends yet. Create a group and share the invite link.
        </p>
      )}
      <ul className="space-y-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {friends.map((f: any) => (
          <li key={f.user.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{f.user.displayName}</p>
              <p className={`font-semibold tabular-nums ${f.net > 0 ? 'text-[var(--success)]' : f.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--muted-foreground)]'}`}>
                {f.net > 0 ? `owes you ${formatAmount(f.net)}` : f.net < 0 ? `you owe ${formatAmount(-f.net)}` : 'settled ✓'}
              </p>
            </div>
            {f.groups.length > 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {f.groups.map((g: any) => `${g.name}: ${g.net > 0 ? '+' : '−'}${formatAmount(Math.abs(g.net))}`).join(' · ')}
              </p>
            )}
            {f.net !== 0 && (
              <div className="mt-3">
                <SettleButton
                  friendId={f.user.id}
                  friendName={f.user.displayName}
                  net={f.net}
                  friendHasUpi={!!f.user.upiId}
                  myUpi={me?.upiId || null}
                  upiLink={f.net < 0 ? ledger.upiLink({ vpa: f.user.upiId, name: f.user.displayName, amount: -f.net }) : null}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
