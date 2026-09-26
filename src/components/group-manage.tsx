'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X } from 'lucide-react'
import { Avatar, Chip, PrimaryButton, Sheet, toast } from '@/components/kit'
import { ShareLink } from '@/components/settle'

export function GroupMembers({ groupId, inviteCode, members, friends, me, canManage }: {
  groupId: string
  inviteCode: string
  members: { id: string; displayName: string; isPlaceholder: boolean }[]
  friends: { id: string; name: string }[]
  me: string
  canManage: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id))

  const add = async (body: { userId?: string; name?: string }) => {
    setBusy(true)
    const res = await fetch(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'Couldn’t add', { tone: 'error' }); return }
    setName('')
    router.refresh()
  }
  const remove = async (id: string, displayName: string) => {
    if (!confirm(`Remove ${displayName} from this group?`)) return
    const res = await fetch(`/api/groups/${groupId}/members/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'Couldn’t remove', { tone: 'error' }); return }
    router.refresh()
  }
  const leave = async () => {
    if (!confirm('Leave this group?')) return
    const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'Couldn’t leave', { tone: 'error' }); return }
    router.push('/friends?tab=groups')
    router.refresh()
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold">Members</h2>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg"><UserPlus size={15} /> Add</button>
      </div>
      <div className="card divide-y divide-line/[0.07] overflow-hidden">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.displayName} id={m.id} size={32} />
            <span className="flex-1 text-[15px]">{m.id === me ? 'You' : m.displayName}{m.isPlaceholder && <span className="ml-1.5 text-[12px] text-faint">not joined</span>}</span>
            {canManage && m.id !== me && (
              <button onClick={() => remove(m.id, m.displayName)} className="flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-danger" aria-label={`Remove ${m.displayName}`}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={leave} className="px-1 text-[13px] text-muted hover:text-danger">Leave group</button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add people">
        <p className="label mb-2">Invite link</p>
        <ShareLink url={`/join/${inviteCode}`} title="Join my group on FairShare" />
        {candidates.length > 0 && (
          <>
            <p className="label mb-2 mt-5">Your friends</p>
            <div className="flex flex-wrap gap-2">
              {candidates.map((f) => <Chip key={f.id} onClick={() => add({ userId: f.id })}>+ {f.name}</Chip>)}
            </div>
          </>
        )}
        <p className="label mb-2 mt-5">Someone new</p>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) add({ name }) }} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className="field flex-1" autoCapitalize="words" />
          <PrimaryButton disabled={busy || !name.trim()}>Add</PrimaryButton>
        </form>
        <p className="mt-2 px-1 text-[12.5px] text-muted">They don’t need an account to be part of the split.</p>
      </Sheet>
    </section>
  )
}
