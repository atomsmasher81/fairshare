'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Member {
  userId: string
  user: {
    id: string
    displayName: string
    username: string
  }
}

interface GroupMembersManagerProps {
  groupId: string
  members: Member[]
  currentUserId: string
  canManageMembers: boolean
}

export function GroupMembersManager({
  groupId,
  members,
  currentUserId,
  canManageMembers,
}: GroupMembersManagerProps) {
  const router = useRouter()
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const removeMember = async (member: Member) => {
    setError('')

    const confirmed = window.confirm(
      `Remove ${member.user.displayName} from this group?\n\n` +
      'Their old expenses and balances will stay in the history, but they will no longer be part of future group activity.'
    )

    if (!confirmed) return

    setRemovingUserId(member.userId)

    try {
      const response = await fetch(`/api/groups/${groupId}/members/${member.userId}`, {
        method: 'DELETE',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove member')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {members.map((member) => {
          const isCurrentUser = member.userId === currentUserId
          const canRemoveThisMember = canManageMembers && !isCurrentUser

          return (
            <div
              key={member.userId}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-strong)] text-xs font-medium text-[var(--foreground)]">
                {member.user.displayName[0].toUpperCase()}
              </div>
              <span className="text-sm text-[var(--foreground)]">
                {member.user.displayName}
                {isCurrentUser && ' (you)'}
              </span>
              {canRemoveThisMember && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-6 rounded-full px-2 text-[11px]"
                  disabled={removingUserId === member.userId}
                  onClick={() => removeMember(member)}
                >
                  {removingUserId === member.userId ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {canManageMembers ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Removing a member keeps historical expenses intact and only removes them from future group activity.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Only the group creator or an admin can remove members.
        </p>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  )
}
