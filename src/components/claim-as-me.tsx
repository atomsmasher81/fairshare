'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrimaryButton, toast } from '@/components/kit'

/** Already signed in: merge the placeholder's history into this account. */
export function ClaimAsMe({ code }: { code: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const res = await fetch(`/api/claim/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mergeIntoMe: true }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'Couldn’t join', { tone: 'error' }); return }
    router.push('/friends')
    router.refresh()
  }
  return <PrimaryButton className="w-full" onClick={go} disabled={busy}>{busy ? 'Joining…' : 'That’s me — add to my account'}</PrimaryButton>
}
