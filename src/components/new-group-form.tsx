'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Chip, PrimaryButton, toast } from '@/components/kit'

export function NewGroupForm({ friends }: { friends: { id: string; name: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [newNames, setNewNames] = useState<string[]>([])
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState(false)

  const addName = () => {
    const n = draftName.trim()
    if (n && !newNames.includes(n)) setNewNames((xs) => [...xs, n])
    setDraftName('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const j = await res.json()
      if (!res.ok) { toast(j.error || 'Couldn’t create group', { tone: 'error' }); return }
      const id = j.group.id
      for (const userId of picked) {
        await fetch(`/api/groups/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      }
      for (const n of [...newNames, ...(draftName.trim() ? [draftName.trim()] : [])]) {
        await fetch(`/api/groups/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
      }
      router.push(`/groups/${id}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus maxLength={60} className="field h-14 text-[18px]" required />

      <div>
        <p className="label mb-2 px-1">Who’s in it</p>
        {friends.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {friends.map((f) => (
              <Chip key={f.id} active={picked.includes(f.id)} onClick={() => setPicked((xs) => xs.includes(f.id) ? xs.filter((x) => x !== f.id) : [...xs, f.id])}>
                {f.name}
              </Chip>
            ))}
          </div>
        )}
        {newNames.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {newNames.map((n) => (
              <span key={n} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink pl-3.5 pr-2 text-[14px] text-ink-fg">
                {n}
                <button type="button" onClick={() => setNewNames((xs) => xs.filter((x) => x !== n))} aria-label={`Remove ${n}`}><X size={14} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Add someone by name"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addName() } }}
            className="field flex-1" autoCapitalize="words" />
          <button type="button" onClick={addName} className="h-12 rounded-2xl border border-line/10 px-4 font-medium">Add</button>
        </div>
        <p className="mt-2 px-1 text-[12.5px] text-muted">You can also share an invite link from the group later.</p>
      </div>

      <PrimaryButton className="w-full" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create group'}</PrimaryButton>
    </form>
  )
}
