'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Delete, CalendarDays, ChevronRight, Plus, Check, Trash2, UserPlus, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inr, NEEDS, NEED_META, todayKey, dayLabel, istDay, type Need } from '@/lib/format'
import { Avatar, Chip, PrimaryButton, SecondaryButton, Segmented, Sheet, toast } from '@/components/kit'
import type { EditorOptions, TimelineItem } from '@/lib/queries'
import { Timeline } from '@/components/timeline'

export interface EditorInitial {
  id?: string
  description: string
  amount: number // paise
  needLevel: Need | null
  paymentMethodId: string | null
  date: string // YYYY-MM-DD
  target: { type: 'personal' } | { type: 'friends'; ids: string[] } | { type: 'group'; id: string }
  paidById: string
  splitMode: 'equal' | 'exact' | 'full'
  participants: string[] | null
  splits: { userId: string; amount: number }[] | null
  assetId?: string | null
}

/* ---------- tiny safe calculator: digits . + − × ÷ ---------- */

function evaluate(expr: string): number | null {
  const tokens = expr.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').match(/(\d+\.?\d*|\.\d+|[+\-*/])/g)
  if (!tokens) return null
  const nums: number[] = []
  const ops: string[] = []
  const prec = (o: string) => (o === '+' || o === '-' ? 1 : 2)
  const apply = () => {
    const b = nums.pop()!, a = nums.pop()!, o = ops.pop()!
    nums.push(o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : b === 0 ? NaN : a / b)
  }
  let expectNum = true
  for (const t of tokens) {
    if (/[+\-*/]/.test(t)) {
      if (expectNum) return null
      while (ops.length && prec(ops[ops.length - 1]) >= prec(t)) apply()
      ops.push(t)
      expectNum = true
    } else {
      nums.push(parseFloat(t))
      expectNum = false
    }
  }
  if (expectNum) { ops.pop() } // trailing operator: ignore it
  while (ops.length && nums.length >= 2) apply()
  const v = nums[0]
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

const isOp = (c: string) => '+−×÷'.includes(c)

/* ---------- component ---------- */

const VIA_LABEL: Record<string, string> = { siri: 'Siri heard', 'say-it': 'You typed', sms: 'Bank SMS', telegram: 'Telegram', mcp: 'From Claude' }

export function ExpenseEditor({ options, initial, backHref = '/home', fromDraft, history, capture }: {
  options: EditorOptions
  initial: EditorInitial
  backHref?: string
  fromDraft?: boolean
  history?: TimelineItem[]
  capture?: { text: string | null; via: string | null; parsedBy: string | null }
}) {
  const router = useRouter()
  const me = options.me.id
  const editing = !!initial.id

  const [expr, setExpr] = useState(initial.amount ? String(initial.amount / 100) : '')
  const [description, setDescription] = useState(initial.description)
  const [need, setNeed] = useState<Need | null>(initial.needLevel)
  const [assetId, setAssetId] = useState<string | null>(initial.assetId || null)
  const [methodId, setMethodId] = useState<string | null>(initial.paymentMethodId)
  const [date, setDate] = useState(initial.date)
  const [target, setTarget] = useState(initial.target)
  const [paidById, setPaidById] = useState(initial.paidById)
  const [splitMode, setSplitMode] = useState(initial.splitMode)
  const [participants, setParticipants] = useState<string[] | null>(initial.participants)
  const [exact, setExact] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial.splits || []).map((s) => [s.userId, String(s.amount / 100)])))
  const [descFocused, setDescFocused] = useState(false)
  const [splitSheet, setSplitSheet] = useState(false)
  const [friendSheet, setFriendSheet] = useState(false)
  const [historySheet, setHistorySheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [friends, setFriends] = useState(options.friends)
  const dateRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLInputElement>(null)
  const splitRowRef = useRef<HTMLDivElement>(null)

  // Opened from a friend or group page: make sure the chosen chip is in view
  useEffect(() => {
    const el = splitRowRef.current?.querySelector('[aria-pressed="true"]') as HTMLElement | null
    if (el && splitRowRef.current) splitRowRef.current.scrollLeft = el.offsetLeft - 16
  }, [])

  const amountRupees = evaluate(expr) ?? 0
  const amount = Math.round(amountRupees * 100)
  const hasOps = /[+−×÷]/.test(expr.slice(1))

  // Opened from the "Say it" preview: start from what was parsed
  useEffect(() => {
    if (!fromDraft) return
    try {
      const raw = sessionStorage.getItem('fs-draft')
      if (!raw) return
      sessionStorage.removeItem('fs-draft')
      const d = JSON.parse(raw)
      setExpr(String(d.amount / 100))
      setDescription(d.description || '')
      setNeed(d.needLevel || null)
      if (d.assetId) setAssetId(d.assetId)
      if (d.paymentMethodId) setMethodId(d.paymentMethodId)
      setDate(istDay(d.date))
      setTarget(d.groupId ? { type: 'group', id: d.groupId } : d.friendIds?.length ? { type: 'friends', ids: d.friendIds } : { type: 'personal' })
      setPaidById(d.paidById)
      setSplitMode(d.splitMode || 'equal')
      if (d.splitMode === 'exact' && d.splits) setExact(Object.fromEntries(d.splits.map((s: { userId: string; amount: number }) => [s.userId, String(s.amount / 100)])))
    } catch {}
  }, [fromDraft])

  /* ----- who's in this ----- */
  const nameOf = useCallback((id: string) =>
    id === me ? 'You' : friends.find((f) => f.id === id)?.name
      || options.groups.flatMap((g) => g.members).find((m) => m.id === id)?.name || 'Someone', [friends, options.groups, me])

  const members: string[] = useMemo(() => {
    if (target.type === 'group') return options.groups.find((g) => g.id === target.id)?.members.map((m) => m.id) || [me]
    if (target.type === 'friends') return [me, ...target.ids]
    return [me]
  }, [target, options.groups, me])
  const shared = members.length > 1
  const sharers = participants?.length ? members.filter((id) => participants.includes(id)) : members
  const payer = members.includes(paidById) ? paidById : me

  // Keep state coherent when the people change
  useEffect(() => {
    if (!members.includes(paidById)) setPaidById(me)
    if (participants && !participants.every((id) => members.includes(id))) setParticipants(null)
  }, [members, paidById, participants, me])

  /* ----- split preview ----- */
  const exactSum = Math.round(Object.entries(exact).filter(([id]) => members.includes(id)).reduce((a, [, v]) => a + (parseFloat(v) || 0), 0) * 100)
  const splitSummary = useMemo(() => {
    if (!shared) return null
    if (splitMode === 'full') {
      const owers = members.filter((id) => id !== payer)
      return owers.length === 1 ? `${nameOf(owers[0])} owe${owers[0] === me ? '' : 's'} the full amount` : 'Others owe the full amount'
    }
    if (splitMode === 'exact') return 'Split by exact amounts'
    const each = sharers.length ? amount / sharers.length : 0
    return `Split equally${amount ? ` · ${inr(Math.round(each))} each` : ''}${sharers.length !== members.length ? ` · ${sharers.length} people` : ''}`
  }, [shared, splitMode, members, payer, sharers, amount, nameOf, me])

  const myShare = useMemo(() => {
    if (!shared) return amount
    if (splitMode === 'full') return payer === me ? 0 : Math.round(amount / Math.max(1, members.length - 1))
    if (splitMode === 'exact') return Math.round((parseFloat(exact[me] || '0') || 0) * 100)
    return sharers.includes(me) ? Math.round(amount / sharers.length) : 0
  }, [shared, amount, splitMode, payer, me, members.length, exact, sharers])

  /* ----- keypad ----- */
  // The amount is a real input (keyboard suppressed with inputMode="none") so it has a cursor:
  // tap between digits to fix one, and the keypad types at the cursor.
  const amountRef = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const lastSel = useRef<[number, number] | null>(null) // where the cursor was, even after a tap elsewhere
  const validExpr = (e: string) =>
    e === '' || (/^(\d{1,9}(\.\d{0,2})?)([+−×÷](\d{1,9}(\.\d{0,2})?)?)*$/.test(e) && !/[+−×÷]{2}/.test(e))

  const press = useCallback((k: string) => {
    if (navigator.vibrate) navigator.vibrate(5)
    setExpr((e) => {
      const el = amountRef.current
      const focused = el && document.activeElement === el
      const sel: [number, number] | null = focused && el.selectionStart !== null ? [el.selectionStart, el.selectionEnd ?? el.selectionStart] : lastSel.current
      const at = sel ? Math.min(sel[0], e.length) : e.length
      const end = sel ? Math.min(sel[1], e.length) : at
      let before = e.slice(0, at)
      let after = e.slice(end)
      let next: string
      if (k === 'clear') { caret.current = 0; return '' }
      if (k === 'back') {
        if (end > at) next = before + after
        else { before = before.slice(0, -1); next = before + after }
      } else if (isOp(k)) {
        if (!before) return e
        if (isOp(before.slice(-1))) before = before.slice(0, -1)
        if (isOp(after.slice(0, 1))) after = after.slice(1)
        before += k
        next = before + after
      } else if (k === '.') {
        const seg = (before.split(/[+−×÷]/).pop() || '') + (after.split(/[+−×÷]/)[0] || '')
        if (seg.includes('.')) return e
        before += (before && !isOp(before.slice(-1)) ? '.' : '0.')
        next = before + after
      } else {
        // a lone leading zero is replaced ("0" + "5" → "5")
        const segBefore = before.split(/[+−×÷]/).pop() || ''
        if (segBefore === '0' && !(after.split(/[+−×÷]/)[0] || '')) before = before.slice(0, -1)
        before += k
        next = before + after
      }
      if (!validExpr(next)) return e
      caret.current = before.length
      return next
    })
  }, [])

  // Put the cursor back where the keypad left it
  useEffect(() => {
    const el = amountRef.current
    if (el && caret.current !== null) {
      lastSel.current = [caret.current, caret.current]
      if (document.activeElement === el) el.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  }, [expr])

  const settle = () => {
    const v = evaluate(expr)
    if (v !== null && hasOps) setExpr(v > 0 ? String(v) : '')
  }

  // Physical keyboard on desktop
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (descFocused || splitSheet || friendSheet) return
      const t = ev.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t !== amountRef.current) return
      const map: Record<string, string> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', '.': '.', Backspace: 'back', Escape: 'clear' }
      if (/^\d$/.test(ev.key)) press(ev.key)
      else if (map[ev.key]) press(map[ev.key])
      else if (ev.key === 'Enter' || ev.key === '=') { ev.preventDefault(); if (hasOps) settle(); else void save(false) }
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ----- suggestions from your history ----- */
  const suggestions = useMemo(() => {
    const q = description.trim().toLowerCase()
    const list = options.suggestions.filter((s) => (q ? s.description.toLowerCase().startsWith(q) && s.description.toLowerCase() !== q : true))
    return list.slice(0, 8)
  }, [description, options.suggestions])

  const pickSuggestion = (s: EditorOptions['suggestions'][number]) => {
    setDescription(s.description)
    if (s.needLevel && !need) setNeed(s.needLevel as Need)
    if (s.methodId && options.methods.some((m) => m.id === s.methodId)) setMethodId(s.methodId)
    descRef.current?.blur()
  }

  /* ----- split target ----- */
  const toggleFriend = (id: string) => {
    setSplitMode((m) => (m === 'exact' ? 'equal' : m))
    setParticipants(null)
    setTarget((t) => {
      const ids = t.type === 'friends' ? t.ids : []
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
      return next.length ? { type: 'friends', ids: next } : { type: 'personal' }
    })
  }
  const chooseGroup = (id: string) => {
    setSplitMode('equal')
    setParticipants(null)
    setTarget((t) => (t.type === 'group' && t.id === id ? { type: 'personal' } : { type: 'group', id }))
  }

  /* ----- save ----- */
  const valid = amount > 0 && (!shared || splitMode !== 'exact' || exactSum === amount)

  async function save(another: boolean) {
    if (busy) return
    if (amount <= 0) { toast('Enter an amount', { tone: 'error' }); return }
    if (shared && splitMode === 'exact' && exactSum !== amount) {
      toast(`Split adds up to ${inr(exactSum)}, not ${inr(amount)}`, { tone: 'error' })
      setSplitSheet(true)
      return
    }
    setBusy(true)
    const body = {
      description: description.trim(),
      amount,
      needLevel: need,
      assetId: need === 'investment' ? assetId : null,
      paymentMethodId: payer === me ? methodId : null,
      date,
      target,
      paidById: payer,
      splitMode: shared ? splitMode : 'equal',
      participants: shared && splitMode !== 'exact' && participants?.length ? participants : undefined,
      splits: shared && splitMode === 'exact'
        ? members.map((id) => ({ userId: id, amount: Math.round((parseFloat(exact[id] || '0') || 0) * 100) })).filter((s) => s.amount > 0)
        : undefined,
    }
    try {
      const res = await fetch(editing ? `/api/expenses/${initial.id}` : '/api/expenses', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) { toast(j.error || 'Couldn’t save', { tone: 'error' }); return }
      const label = `${body.description || (need ? NEED_META[need].label : 'Expense')} · ${inr(amount)}`
      if (another) {
        toast(`Saved ${label}`)
        setExpr('')
        setDescription('')
        setNeed(null)
        router.refresh()
      } else {
        toast(editing ? 'Saved changes' : `Added ${label}`)
        router.push(backHref)
        router.refresh()
      }
    } catch {
      toast('No connection — try again', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial.id || !confirm('Delete this expense?')) return
    const res = await fetch(`/api/expenses/${initial.id}`, { method: 'DELETE' })
    if (!res.ok) { toast('Couldn’t delete', { tone: 'error' }); return }
    const id = initial.id
    toast('Expense deleted', {
      action: { label: 'Undo', run: async () => { await fetch(`/api/expenses/${id}/restore`, { method: 'POST' }); router.refresh() } },
    })
    router.push(backHref)
    router.refresh()
  }

  const selectedFriendIds = target.type === 'friends' ? target.ids : []
  const selectedGroupId = target.type === 'group' ? target.id : null


  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg md:static md:z-auto md:mx-auto md:max-w-md md:pt-4">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pb-1 pt-[max(12px,env(safe-area-inset-top))] md:px-0">
        <Link href={backHref} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunken" aria-label="Close">
          <X size={22} />
        </Link>
        <p className="text-[15px] font-semibold">{editing ? 'Edit expense' : 'New expense'}</p>
        <div className="flex items-center gap-1">
          {editing && history && history.length > 0 && (
            <button onClick={() => setHistorySheet(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunken" aria-label="History">
              <History size={19} />
            </button>
          )}
          {editing && (
            <button onClick={remove} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-danger" aria-label="Delete">
              <Trash2 size={19} />
            </button>
          )}
          <button
            onClick={() => dateRef.current?.showPicker ? dateRef.current.showPicker() : dateRef.current?.click()}
            className="relative flex h-9 items-center gap-1.5 rounded-full bg-sunken px-3 text-[13px] font-medium"
          >
            <CalendarDays size={15} />
            {dayLabel(date)}
            <input
              ref={dateRef}
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 opacity-0"
              tabIndex={-1}
              aria-label="Date"
            />
          </button>
        </div>
      </div>

      {/* scrollable middle */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 md:px-0">
        {/* amount — tap to place the cursor; the keypad below types at it */}
        <div className="relative flex w-full flex-col items-center pb-2 pt-1">
          <div className="flex w-full items-center justify-center">
            <span className={cn('num font-semibold tracking-[-0.045em]', amount ? 'text-fg' : 'text-faint', expr.length > 11 ? 'text-[34px]' : 'text-[50px]')}>₹</span>
            <input
              ref={amountRef}
              value={expr}
              inputMode="none"
              autoFocus={!editing}
              placeholder="0"
              aria-label="Amount"
              onFocus={() => descRef.current?.blur()}
              onSelect={(ev) => { const t = ev.currentTarget; if (t.selectionStart !== null) lastSel.current = [t.selectionStart, t.selectionEnd ?? t.selectionStart] }}
              onChange={(ev) => {
                const v = ev.target.value.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/[^\d.+−×÷]/g, '')
                if (validExpr(v)) setExpr(v)
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === '=') { ev.preventDefault(); if (hasOps) settle(); else void save(false) }
              }}
              className={cn('num min-w-0 bg-transparent text-center font-semibold tracking-[-0.045em] caret-[rgb(var(--essential))] outline-none placeholder:text-faint',
                amount ? 'text-fg' : 'text-faint', expr.length > 11 ? 'text-[34px]' : 'text-[50px]')}
              style={{ width: `${Math.max(1, expr.length || 1) * (expr.length > 11 ? 0.62 : 0.6)}em`, maxWidth: '82%' }}
            />
            {expr && (
              <button type="button" onClick={() => { setExpr(''); amountRef.current?.focus() }} aria-label="Clear amount"
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
                <X size={15} />
              </button>
            )}
          </div>
          <span className="mt-0.5 block h-5 text-[14px] text-muted">
            {hasOps && amount > 0 ? `= ${inr(amount)}` : shared && amount > 0 ? `${amount >= 100000 ? inr(amount) + ' · ' : ''}Your share ${inr(myShare)}` : amount >= 100000 ? inr(amount) : ''}
          </span>
          {capture?.text && (
            <p className="mt-1 max-w-full truncate rounded-full bg-sunken px-3 py-1 text-[12.5px] text-muted" title={capture.text}>
              {VIA_LABEL[capture.via || ''] || 'Heard'}: “{capture.text}”
              {capture.parsedBy && <span className="text-faint"> · {capture.parsedBy.startsWith('gemini') || capture.parsedBy.startsWith('groq') || capture.parsedBy.startsWith('openai') ? 'AI' : capture.parsedBy}</span>}
            </p>
          )}
        </div>

        {/* description */}
        <input
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setTimeout(() => setDescFocused(false), 120)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); descRef.current?.blur() } }}
          placeholder="What was it for?"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          maxLength={120}
          className="h-12 w-full rounded-2xl bg-card px-4 text-center text-[17px] outline-none shadow-[var(--shadow-soft)] placeholder:text-faint"
        />
        {suggestions.length > 0 && (descFocused || !description) && (
          <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            {suggestions.map((s) => (
              <button key={s.description} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(s)}
                className="h-8 shrink-0 rounded-full bg-sunken px-3 text-[13px] text-muted hover:text-fg">
                {s.description}
              </button>
            ))}
          </div>
        )}

        {/* need level */}
        <div className="mt-4">
          <p className="label mb-2 px-1">Type</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[...NEEDS, 'investment' as Need].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNeed(need === n ? null : n)}
                aria-pressed={need === n}
                className={cn('pressable flex h-11 items-center justify-center gap-1.5 rounded-2xl border text-[13.5px] font-medium transition-colors',
                  need === n ? 'border-transparent text-white' : 'border-line/10 bg-card')}
                style={need === n ? { background: NEED_META[n].color } : undefined}
              >
                {need !== n && <span className="h-2 w-2 rounded-full" style={{ background: NEED_META[n].color }} />}
                {NEED_META[n].short}
              </button>
            ))}
          </div>
          {need === 'investment' && (
            <div className="mt-2.5">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="text-[12.5px] text-muted">Into (adds to that account in Net worth)</p>
                <Link href="/wealth" className="text-[12px] text-muted hover:text-fg">Accounts</Link>
              </div>
              {options.accounts.length ? (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
                  {options.accounts.map((a) => (
                    <Chip key={a.id} active={assetId === a.id} onClick={() => setAssetId(assetId === a.id ? null : a.id)}>{a.name}</Chip>
                  ))}
                </div>
              ) : (
                <p className="px-1 text-[13px] text-faint">No accounts yet — add your mutual funds, PPF… under Net worth.</p>
              )}
            </div>
          )}
        </div>

        {/* payment method — only meaningful when you paid */}
        {payer === me && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="label">Paid with</p>
              <Link href="/settings#methods" className="text-[12px] text-muted hover:text-fg">Edit</Link>
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              {options.methods.map((m) => (
                <Chip key={m.id} active={methodId === m.id} onClick={() => setMethodId(methodId === m.id ? null : m.id)}>{m.name}</Chip>
              ))}
            </div>
          </div>
        )}

        {/* split */}
        <div className="mt-4 pb-3">
          <p className="label mb-2 px-1">Split with</p>
          <div ref={splitRowRef} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <Chip active={target.type === 'personal'} onClick={() => { setTarget({ type: 'personal' }); setSplitMode('equal') }}>Just me</Chip>
            {friends.map((f) => (
              <Chip key={f.id} active={selectedFriendIds.includes(f.id)} onClick={() => toggleFriend(f.id)}>
                {selectedFriendIds.includes(f.id) && <Check size={14} strokeWidth={3} />}
                {f.name.split(' ')[0]}
              </Chip>
            ))}
            {options.groups.map((g) => (
              <Chip key={g.id} active={selectedGroupId === g.id} onClick={() => chooseGroup(g.id)}>
                <span className="text-[12px] opacity-60">#</span>{g.name}
              </Chip>
            ))}
            <Chip onClick={() => setFriendSheet(true)} className="text-muted"><UserPlus size={15} /> Friend</Chip>
          </div>

          {shared && (
            <button type="button" onClick={() => setSplitSheet(true)}
              className="card mt-2.5 flex w-full items-center gap-3 px-4 py-2.5 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">
                  Paid by <b className="font-semibold">{payer === me ? 'you' : nameOf(payer)}</b>
                </p>
                <p className={cn('text-[13px]', splitMode === 'exact' && exactSum !== amount ? 'text-danger' : 'text-muted')}>
                  {splitMode === 'exact' && exactSum !== amount ? `${inr(exactSum)} of ${inr(amount)} assigned` : splitSummary}
                </p>
              </div>
              <ChevronRight size={18} className="text-faint" />
            </button>
          )}
        </div>
      </div>

      {/* keypad */}
      <div className={cn('border-t border-line/[0.06] bg-bg px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 md:border-0 md:px-0', descFocused && 'hidden md:block')}>
        <div className="grid grid-cols-4 gap-1.5 md:hidden">
          {['1', '2', '3', '+', '4', '5', '6', '−', '7', '8', '9', '×', '.', '0', 'back', '÷'].map((k) => (
            <button
              key={k}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => press(k)}
              onContextMenu={(e) => { if (k === 'back') { e.preventDefault(); press('clear') } }}
              className={cn('flex h-[48px] select-none items-center justify-center rounded-2xl text-[22px] transition-colors active:bg-fg/10',
                isOp(k) ? 'bg-sunken text-muted' : 'bg-card font-medium shadow-[var(--shadow-soft)]')}
              aria-label={k === 'back' ? 'Delete' : k}
            >
              {k === 'back' ? <Delete size={22} /> : k}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {hasOps ? (
            <PrimaryButton className="flex-1" onClick={settle}>= {inr(amount)}</PrimaryButton>
          ) : (
            <>
              {!editing && (
                <SecondaryButton className="px-4" onClick={() => save(true)} disabled={busy || !valid} aria-label="Save and add another">
                  <Plus size={18} /> Next
                </SecondaryButton>
              )}
              <PrimaryButton className="flex-1" onClick={() => save(false)} disabled={busy || !valid}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {/* split details */}
      <Sheet open={splitSheet} onClose={() => setSplitSheet(false)} title="Split details">
        <p className="label mb-2">Paid by</p>
        <div className="flex flex-wrap gap-2">
          {members.map((id) => (
            <Chip key={id} active={payer === id} onClick={() => setPaidById(id)}>{id === me ? 'You' : nameOf(id)}</Chip>
          ))}
        </div>

        <p className="label mb-2 mt-5">How to split</p>
        <Segmented
          value={splitMode}
          onChange={(v) => setSplitMode(v)}
          options={[
            { value: 'equal', label: 'Equally' },
            { value: 'exact', label: 'Exact' },
            { value: 'full', label: payer === me ? 'They owe all' : 'I owe all' },
          ]}
        />

        <div className="mt-4 divide-y divide-line/[0.07]">
          {members.map((id) => {
            const on = sharers.includes(id)
            if (splitMode === 'equal') {
              return (
                <button key={id} type="button" className="flex w-full items-center gap-3 py-3 text-left"
                  onClick={() => {
                    const base = participants?.length ? participants : members
                    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
                    setParticipants(next.length === members.length ? null : next)
                  }}>
                  <Avatar name={nameOf(id)} id={id} size={34} />
                  <span className="flex-1">{id === me ? 'You' : nameOf(id)}</span>
                  <span className="num text-[14px] text-muted">{on && sharers.length ? inr(Math.round(amount / sharers.length)) : '—'}</span>
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border', on ? 'border-ink bg-ink text-ink-fg' : 'border-line/20')}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              )
            }
            if (splitMode === 'exact') {
              return (
                <label key={id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={nameOf(id)} id={id} size={34} />
                  <span className="flex-1">{id === me ? 'You' : nameOf(id)}</span>
                  <span className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
                    <input
                      inputMode="decimal"
                      value={exact[id] || ''}
                      onChange={(e) => setExact((x) => ({ ...x, [id]: e.target.value.replace(/[^\d.]/g, '') }))}
                      placeholder="0"
                      className="num h-11 w-32 rounded-xl border border-line/10 bg-bg pl-7 pr-3 text-right outline-none focus:border-line/25"
                    />
                  </span>
                </label>
              )
            }
            const owes = id !== payer
            return (
              <div key={id} className="flex items-center gap-3 py-3">
                <Avatar name={nameOf(id)} id={id} size={34} />
                <span className="flex-1">{id === me ? 'You' : nameOf(id)}</span>
                <span className="num text-[14px] text-muted">
                  {owes ? inr(Math.round(amount / Math.max(1, members.length - 1))) : 'paid'}
                </span>
              </div>
            )
          })}
        </div>
        {splitMode === 'exact' && (
          <p className={cn('mt-3 text-center text-[14px]', exactSum === amount ? 'text-pos' : 'text-muted')}>
            {exactSum === amount ? 'Adds up ✓' : `${inr(Math.abs(amount - exactSum))} ${exactSum < amount ? 'left to assign' : 'over'}`}
          </p>
        )}
        <PrimaryButton className="mt-5 w-full" onClick={() => setSplitSheet(false)}>Done</PrimaryButton>
      </Sheet>

      <Sheet open={historySheet} onClose={() => setHistorySheet(false)} title="History">
        {history && <Timeline items={history} />}
      </Sheet>

      <AddFriendSheet
        open={friendSheet}
        onClose={() => setFriendSheet(false)}
        onAdded={(f) => {
          setFriends((xs) => (xs.some((x) => x.id === f.id) ? xs : [...xs, f]))
          toggleFriend(f.id)
        }}
      />
    </div>
  )
}

/* ---------- add friend (shared with the Friends page) ---------- */

export function AddFriendSheet({ open, onClose, onAdded }: {
  open: boolean
  onClose: () => void
  onAdded: (f: { id: string; name: string; isPlaceholder: boolean }) => void
}) {
  const [mode, setMode] = useState<'name' | 'username'>('name')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'name' ? { name: value } : { username: value }),
    })
    const j = await res.json()
    setBusy(false)
    if (!res.ok) { setError(j.error || 'Couldn’t add'); return }
    onAdded(j.friend)
    setValue('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a friend">
      <form onSubmit={submit}>
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v); setError('') }}
          options={[{ value: 'name', label: 'By name' }, { value: 'username', label: 'Username' }]}
        />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'name' ? 'Rahul' : '@username'}
          autoCapitalize={mode === 'name' ? 'words' : 'none'}
          autoCorrect="off"
          className="field mt-4"
        />
        <p className="mt-2 px-1 text-[13px] text-muted">
          {mode === 'name'
            ? 'They don’t need an account. You can send them a link later to see your shared balance.'
            : 'For friends already on FairShare.'}
        </p>
        {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
        <PrimaryButton className="mt-4 w-full" disabled={busy || !value.trim()}>{busy ? 'Adding…' : 'Add friend'}</PrimaryButton>
      </form>
    </Sheet>
  )
}
