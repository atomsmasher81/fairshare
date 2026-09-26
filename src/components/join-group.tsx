'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, PrimaryButton, toast } from '@/components/kit'

export function JoinGroup({ code, placeholders }: { code: string; placeholders: { id: string; name: string }[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [claim, setClaim] = useState<string | null>(null)

  const join = async () => {
    setBusy(true)
    const res = await fetch(`/api/groups/join/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimPlaceholderId: claim }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok && !j.groupId) { toast(j.error || 'Couldn’t join', { tone: 'error' }); return }
    router.push(`/groups/${j.groupId}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {placeholders.length > 0 && (
        <div className="card p-4">
          <p className="text-[14px] font-medium">Already in the group as one of these?</p>
          <p className="mt-0.5 text-[13px] text-muted">Pick yourself and the expenses already logged for you come along.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {placeholders.map((p) => (
              <Chip key={p.id} active={claim === p.id} onClick={() => setClaim(claim === p.id ? null : p.id)}>I’m {p.name}</Chip>
            ))}
          </div>
        </div>
      )}
      <PrimaryButton className="w-full" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join group'}</PrimaryButton>
    </div>
  )
}
