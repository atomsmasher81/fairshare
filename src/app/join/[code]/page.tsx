import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { AuthCard } from '@/components/auth-card'
import { JoinGroup } from '@/components/join-group'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Join group' }

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const group = await prisma.group.findUnique({
    where: { inviteCode: code.toUpperCase() },
    select: {
      id: true, name: true, deletedAt: true, isPersonal: true, isDirect: true,
      members: { select: { user: { select: { id: true, displayName: true, isPlaceholder: true } } } },
    },
  })
  if (!group || group.deletedAt || group.isPersonal || group.isDirect) notFound()
  const session = await getSession()
  if (session.isLoggedIn && group.members.some((m) => m.user.id === session.userId)) redirect(`/groups/${group.id}`)
  const names = group.members.filter((m) => !m.user.isPlaceholder).map((m) => m.user.displayName.split(' ')[0])
  const placeholders = group.members.filter((m) => m.user.isPlaceholder).map((m) => ({ id: m.user.id, name: m.user.displayName }))

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Image src="/icon-192.png" alt="" width={48} height={48} className="mb-5 rounded-2xl" />
      <p className="label">You’re invited to</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.04em]">{group.name}</h1>
      <p className="mt-2 text-muted">
        {names.length ? `With ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.` : ''} Split expenses, see who owes whom, settle up on UPI.
      </p>
      <div className="mt-6">
        {session.isLoggedIn ? (
          <JoinGroup code={code} placeholders={placeholders} />
        ) : (
          <AuthCard initialMode="signup" next={`/join/${code}`} />
        )}
      </div>
    </div>
  )
}
