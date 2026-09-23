'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface LedgerOption { id: string | null; name: string; members?: number }

interface Props {
  ledgers: LedgerOption[]          // first = Personal (id null)
  defaultId: string | null
  autoFocus?: boolean
  recent?: string[]                // recent descriptions for one-tap chips
}

export function QuickAdd({ ledgers, defaultId, autoFocus, recent = [] }: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [target, setTarget] = useState<string | null>(defaultId)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setToast(null)
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          ...(/[@#]\w/.test(text) ? {} : target ? { groupId: target } : { groupName: 'personal' }),
          source: 'web',
        }),
      })
      const data = await res.json()
      setToast({ ok: res.ok, msg: data.message || (res.ok ? 'Saved' : 'Failed') })
      if (res.ok) {
        setText('')
        router.refresh()
      }
    } catch {
      setToast({ ok: false, msg: 'Network error' })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk 20  ·  dinner 1200 @flat"
          inputMode="text"
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/70 px-4 text-base outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[rgba(245,78,0,0.15)]"
        />
        <button disabled={busy || !text.trim()} className="h-12 rounded-2xl bg-[var(--accent)] px-5 font-medium text-white disabled:opacity-40">
          {busy ? '…' : 'Add'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {ledgers.map((l) => (
          <button key={l.id ?? 'personal'} type="button" onClick={() => setTarget(l.id)}
            className={cn('rounded-full border px-3 py-1 text-sm',
              target === l.id ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]' : 'border-[var(--border)] text-[var(--muted-foreground)]')}>
            {l.id ? `👥 ${l.name}` : '🙋 Personal'}
          </button>
        ))}
      </div>

      {recent.length > 0 && !text && (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((r) => (
            <button key={r} type="button" onClick={() => { setText(r + ' '); inputRef.current?.focus() }}
              className="rounded-lg bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
              {r}
            </button>
          ))}
        </div>
      )}

      {toast && (
        <p className={cn('rounded-xl px-3 py-2 text-sm', toast.ok ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]')}>
          {toast.msg}
        </p>
      )}
    </div>
  )
}
