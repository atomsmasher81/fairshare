import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { SettingsClient } from '@/components/settings-client'
import { getLedgerOptions } from '@/lib/server-data'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')
  const userId = session.userId
  const [user, { ledgers, defaultId }] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, upiId: true, apiTokenHash: true, telegramLink: { select: { id: true } } },
    }),
    getLedgerOptions(userId),
  ])
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsClient
        displayName={user?.displayName || ''}
        upiId={user?.upiId || null}
        defaultId={defaultId}
        ledgers={ledgers}
        telegramLinked={!!user?.telegramLink}
        hasToken={!!user?.apiTokenHash}
      />
    </div>
  )
}
