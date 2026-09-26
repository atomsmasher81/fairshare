import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { AuthCard } from '@/components/auth-card'
import { ClaimAsMe } from '@/components/claim-as-me'
import { inr } from '@/lib/format'
/* eslint-disable @typescript-eslint/no-require-imports */
const ledger = require('@/lib/ledger')

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Join FairShare' }

/** A friend added you by name. Create an account (or use yours) to take over that spot. */
export default async function ClaimPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const placeholder = await prisma.user.findUnique({ where: { claimCode: code }, select: { id: true, displayName: true, isPlaceholder: true, addedById: true } })
  if (!placeholder || !placeholder.isPlaceholder) notFound()
  const inviter = placeholder.addedById
    ? await prisma.user.findUnique({ where: { id: placeholder.addedById }, select: { displayName: true } })
    : null
  const session = await getSession()
  if (session.isLoggedIn && session.userId === placeholder.id) redirect('/home')

  // What's waiting for them, from their side
  const balances = await ledger.friendBalances(prisma, placeholder.id)
  const withInviter = balances.find((b: { user: { id: string } }) => b.user.id === placeholder.addedById)
  const net: number = withInviter?.net || 0
  const who = inviter?.displayName.split(' ')[0] || 'Your friend'

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Image src="/icon-192.png" alt="" width={48} height={48} className="mb-5 rounded-2xl" />
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">
        {who} is splitting expenses with you on FairShare
      </h1>
      <p className="mt-2 text-muted">
        {net < 0 ? <>You owe {who} <b className="num text-neg">{inr(-net)}</b> so far.</>
          : net > 0 ? <>{who} owes you <b className="num text-pos">{inr(net)}</b> so far.</>
          : 'You’re all square right now.'}
        {' '}Join to see every expense and add your own.
      </p>
      <div className="mt-6">
        {session.isLoggedIn ? (
          <ClaimAsMe code={code} />
        ) : (
          <AuthCard claimCode={code} claimName={placeholder.displayName} />
        )}
      </div>
    </div>
  )
}
