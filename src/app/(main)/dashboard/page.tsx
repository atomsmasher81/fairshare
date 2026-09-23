import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatAmount } from '@/lib/utils'
import { Prisma } from '@prisma/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type GroupWithDetails = Prisma.GroupGetPayload<{
  include: {
    members: {
      include: {
        user: { select: { id: true; displayName: true } }
      }
    }
    expenses: {
      include: { splits: true }
    }
    settlements: true
    _count: { select: { expenses: true } }
  }
}>

export default async function DashboardPage() {
  const session = await getSession()
  const userId = session.userId!

  const groups: GroupWithDetails[] = await prisma.group.findMany({
    where: {
      members: { some: { userId } },
      deletedAt: null,
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true } },
        },
      },
      expenses: {
        where: { deletedAt: null },
        include: { splits: true },
      },
      settlements: true,
      _count: { select: { expenses: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  let totalOwed = 0
  let totalOwing = 0

  for (const group of groups) {
    let netBalance = 0

    for (const expense of group.expenses) {
      if (expense.paidById === userId) {
        netBalance += expense.amount
      }
      for (const split of expense.splits) {
        if (split.userId === userId) {
          netBalance -= split.amount
        }
      }
    }

    for (const settlement of group.settlements) {
      if (settlement.fromUserId === userId) {
        netBalance += settlement.amount
      }
      if (settlement.toUserId === userId) {
        netBalance -= settlement.amount
      }
    }

    if (netBalance > 0) {
      totalOwed += netBalance
    } else {
      totalOwing += Math.abs(netBalance)
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.58),rgba(255,255,255,0.24))]">
          <CardHeader>
            <div className="eyebrow">Overview</div>
            <CardTitle className="text-4xl">Your group balances, at a glance.</CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Keep spending, settlements, and active groups in one clean workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.5)] p-5">
              <p className="mb-1 text-sm text-[var(--muted-foreground)]">You are owed</p>
              <p className="text-3xl font-semibold text-[var(--success)]">{formatAmount(totalOwed)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.5)] p-5">
              <p className="mb-1 text-sm text-[var(--muted-foreground)]">You owe</p>
              <p className="text-3xl font-semibold text-[var(--danger)]">{formatAmount(totalOwing)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="eyebrow">Actions</div>
            <CardTitle>Start something new</CardTitle>
            <CardDescription>Create a fresh group or jump into an existing one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/groups/new" className="block">
              <Button className="w-full justify-center">Create new group</Button>
            </Link>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
              {groups.length} active group{groups.length !== 1 ? 's' : ''} in your workspace
            </div>
          </CardContent>
        </Card>
      </section>

      <div>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="eyebrow mb-2">Groups</p>
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">Your active spaces</h2>
          </div>
          <Link href="/groups/new" className="text-sm font-medium text-[var(--accent)] hover:opacity-80">
            Create new →
          </Link>
        </div>

        {groups.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="mb-4 text-[var(--muted-foreground)]">You&apos;re not in any groups yet</p>
            <Link href="/groups/new"><Button>Create your first group</Button></Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((group: GroupWithDetails) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="block rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-[var(--foreground)]">{group.name}</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {group.members.length} member{group.members.length !== 1 ? 's' : ''} · {group._count.expenses} expense{group._count.expenses !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">Open</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
