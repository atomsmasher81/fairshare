'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Sparkles, Pencil, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inr, NEED_META, dayLabel, istDay, type Need } from '@/lib/format'
import { PrimaryButton, SecondaryButton, toast } from '@/components/kit'
import type { Draft } from '@/lib/entry'

const EXAMPLES = ['chai 20', 'groceries 640 on gpay', 'dinner 1800 with Rahul and Amit', 'Rahul paid 500 for the cab', 'paid Amit back 300']

/**
 * One text box for everything. Simple personal entries ("milk 20") save instantly with Undo;
 * anything involving people or AI gets a preview card first so nothing surprising is saved.
 */
export function SayIt({ methods, compact }: { methods: { id: string; name: string }[]; compact?: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState(EXAMPLES[0])
  useEffect(() => setHint(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]), [])

  const save = async (d: Draft) => {
    setBusy(true)
    try {
      const res = await fetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: d }) })
      const j = await res.json()
      if (!res.ok) { toast(j.error || 'Couldn’t save', { tone: 'error' }); return }
      const id = j.id as string | null
      toast(j.message.replace(/^✅\s*/, 'Added '), id ? {
        action: { label: 'Undo', run: async () => { await fetch(`/api/expenses/${id}`, { method: 'DELETE' }); router.refresh() } },
      } : {})
      setDraft(null)
      setText('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError('')
    setDraft(null)
    try {
      const res = await fetch('/api/entries/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'Couldn’t understand that'); return }
      const d = j.draft as Draft
      setBusy(false)
      if (d.kind === 'expense' && d.via === 'quick' && !d.groupId && !d.friendIds.length) await save(d)
      else setDraft(d)
    } catch {
      setError('No connection — try again')
    } finally {
      setBusy(false)
    }
  }

  const edit = (d: Draft) => {
    try { sessionStorage.setItem('fs-draft', JSON.stringify(d)) } catch {}
    router.push('/add?draft=1')
  }

  const methodName = (id: string | null) => methods.find((m) => m.id === id)?.name
  const need = draft?.needLevel as Need | null

  return (
    <div>
      <form onSubmit={submit} className={cn('card flex items-center gap-2 p-1.5 pl-4', error && 'ring-1 ring-danger/40')}>
        <Sparkles size={18} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setError('') }}
          placeholder={`Try “${hint}”`}
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          aria-label="Describe an expense"
        />
        <button
          disabled={busy || !text.trim()}
          className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ink text-ink-fg transition-opacity disabled:opacity-25"
          aria-label="Add"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-fg/30 border-t-ink-fg" /> : <ArrowUp size={20} strokeWidth={2.4} />}
        </button>
      </form>
      {error ? (
        <p className="mt-2 px-2 text-[13px] text-danger">{error}</p>
      ) : !compact && !draft ? (
        <p className="mt-2 flex items-center gap-1.5 px-2 text-[12.5px] text-faint">
          <Mic size={13} /> Tap the mic on your keyboard to just say it.
        </p>
      ) : null}

      {draft && (
        <div className="card mt-3 animate-rise-in p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-muted">{draft.kind === 'settlement' ? 'Payment' : draft.groupName ? draft.groupName : draft.friendIds.length ? 'Shared' : 'Personal'}</p>
              <p className="truncate text-[18px] font-semibold tracking-[-0.02em]">
                {draft.kind === 'settlement'
                  ? draft.toUserId === draft.people[0]?.id ? `You paid ${draft.people[0]?.name}` : `${draft.people[0]?.name} paid you`
                  : draft.description}
              </p>
            </div>
            <p className="num text-[22px] font-semibold tracking-[-0.03em]">{inr(draft.amount)}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[13px]">
            {need && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1">
                <span className="h-2 w-2 rounded-full" style={{ background: NEED_META[need].color }} />{NEED_META[need].short}
              </span>
            )}
            {methodName(draft.paymentMethodId) && <span className="rounded-full bg-sunken px-2.5 py-1">{methodName(draft.paymentMethodId)}</span>}
            <span className="rounded-full bg-sunken px-2.5 py-1">{dayLabel(istDay(draft.date))}</span>
          </div>

          {draft.kind === 'expense' && draft.people.length > 0 && (() => {
            const payerFriend = draft.people.find((p) => p.id === draft.paidById)
            const names = draft.people.map((p) => p.name.split(' ')[0]).join(', ')
            const how = draft.splitMode === 'full'
              ? payerFriend ? 'you owe it all' : `${names} owe${draft.people.length === 1 ? 's' : ''} it all`
              : draft.splitMode === 'exact' ? 'custom split' : `split equally with ${names}`
            return <p className="mt-3 text-[14px] text-muted">{payerFriend ? `${payerFriend.name.split(' ')[0]} paid` : 'You paid'} · {how}</p>
          })()}
          {draft.notes.map((n) => <p key={n} className="mt-2 text-[13px] text-neg">{n}</p>)}

          <div className="mt-4 flex gap-2">
            {draft.kind === 'expense' && (
              <SecondaryButton className="h-11 flex-1" onClick={() => edit(draft)}><Pencil size={16} /> Edit</SecondaryButton>
            )}
            <SecondaryButton className="h-11 px-4" onClick={() => setDraft(null)}>Cancel</SecondaryButton>
            <PrimaryButton className="h-11 flex-1" onClick={() => save(draft)} disabled={busy}>Save</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
