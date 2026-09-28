import { headers } from 'next/headers'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireUserId, ledger } from '@/lib/queries'
import { getSession } from '@/lib/auth'
import { aiEnabled, systemPrompt } from '@/lib/ai'
import { loadContext, todayIST } from '@/lib/entry'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/kit'
import { netWorth } from '@/lib/wealth'
import { inr } from '@/lib/format'
import { ProfileSection, NotificationsSection, McpSection, AiSection, MethodsSection, ShortcutSection, AppearanceSection, SignOut, TelegramSection } from '@/components/settings-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'You' }

export default async function SettingsPage() {
  const userId = await requireUserId()
  const [user, methods, session, worth] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true, upiId: true, defaultMethodId: true, aiInstructions: true, telegramLink: { select: { id: true } }, apiKeys: { orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true } } },
    }),
    ledger.listPaymentMethods(prisma, userId, { includeArchived: true }) as Promise<{ id: string; name: string; kind: string; archivedAt: Date | null }[]>,
    getSession(),
    netWorth(userId),
  ])
  const ctx = await loadContext(userId)
  const prompt = systemPrompt({
    today: todayIST(),
    methods: ctx.methods.map((m) => m.name),
    friends: ctx.friends.map((f) => f.displayName),
    groups: ctx.groups.map((g) => g.name),
    defaultMethod: ctx.methods.find((m) => m.id === ctx.defaultMethodId)?.name || null,
    frequentItems: ctx.frequentItems,
    instructions: ctx.aiInstructions,
    accounts: ctx.accounts.map((a) => a.name),
  })
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')

  return (
    <div className="space-y-8">
      <PageHeader title={user?.displayName || 'You'} subtitle={`@${user?.username}`} />
      <Link href="/wealth" className="card flex items-center gap-3 p-4 transition-transform active:scale-[0.99]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-invest/15 text-[18px]">📈</span>
        <span className="flex-1">
          <span className="block font-medium">Net worth</span>
          <span className="block text-[13px] text-muted">{worth.accounts.length ? `${inr(worth.total, { decimals: 'never' })} across ${worth.accounts.length} account${worth.accounts.length === 1 ? '' : 's'}` : 'Track savings, funds, PPF, FDs'}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </Link>
      <ProfileSection displayName={user?.displayName || ''} upiId={user?.upiId || null} />
      <NotificationsSection publicKey={process.env.VAPID_PUBLIC_KEY || null} />
      <MethodsSection methods={methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, archived: !!m.archivedAt }))} defaultId={user?.defaultMethodId || null} />
      <ShortcutSection apiUrl={`${proto}://${host}/api/capture`} keys={(user?.apiKeys || []).map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() || null }))} aiEnabled={aiEnabled()} />
      <AiSection instructions={user?.aiInstructions || ''} prompt={prompt} enabled={aiEnabled()} />
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
