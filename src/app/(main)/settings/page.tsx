import { headers } from 'next/headers'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireUserId, ledger } from '@/lib/queries'
import { getSession } from '@/lib/auth'
import { aiEnabled } from '@/lib/ai'
import { PageHeader } from '@/components/kit'
import { ProfileSection, NotificationsSection, McpSection, MethodsSection, ShortcutSection, AppearanceSection, SignOut, TelegramSection } from '@/components/settings-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'You' }

export default async function SettingsPage() {
  const userId = await requireUserId()
  const [user, methods, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true, upiId: true, telegramLink: { select: { id: true } }, apiKeys: { orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true } } },
    }),
    ledger.listPaymentMethods(prisma, userId, { includeArchived: true }) as Promise<{ id: string; name: string; kind: string; archivedAt: Date | null }[]>,
    getSession(),
  ])
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')

  return (
    <div className="space-y-8">
      <PageHeader title={user?.displayName || 'You'} subtitle={`@${user?.username}`} />
      <ProfileSection displayName={user?.displayName || ''} upiId={user?.upiId || null} />
      <NotificationsSection publicKey={process.env.VAPID_PUBLIC_KEY || null} />
      <MethodsSection methods={methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, archived: !!m.archivedAt }))} />
      <ShortcutSection apiUrl={`${proto}://${host}/api/capture`} keys={(user?.apiKeys || []).map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() || null }))} aiEnabled={aiEnabled()} />
      <McpSection url={`${proto}://${host}/api/mcp`} />
      {process.env.TELEGRAM_BOT_TOKEN && <TelegramSection linked={!!user?.telegramLink} />}
      <AppearanceSection />
      <div className="flex items-center justify-between px-1">
        <SignOut />
        {session.isAdmin && <Link href="/admin" className="text-[14px] text-muted hover:text-fg">Admin</Link>}
      </div>
    </div>
  )
}
