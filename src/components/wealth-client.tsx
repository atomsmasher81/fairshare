'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Archive, ArchiveRestore, Check } from 'lucide-react'
import { Chip, PrimaryButton, SecondaryButton, Sheet, toast } from '@/components/kit'
import { inr, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const KINDS: [string, string][] = [
  ['bank', 'Bank'], ['mutual_fund', 'Mutual fund'], ['stocks', 'Stocks'], ['fd', 'FD'], ['ppf', 'PPF'], ['epf', 'EPF'],
  ['nps', 'NPS'], ['gold', 'Gold'], ['crypto', 'Crypto'], ['real_estate', 'Property'], ['loan', 'Loan'], ['other', 'Other'],
]
const SUGGESTIONS: [string, string][] = [
  ['Savings account', 'bank'], ['Mutual funds', 'mutual_fund'], ['Stocks', 'stocks'], ['Fixed deposit', 'fd'],
  ['PPF', 'ppf'], ['EPF', 'epf'], ['NPS', 'nps'], ['Gold', 'gold'],
]

const rupees = (paise: number) => (paise ? String(Math.round(paise) / 100) : '')
const toPaise = (v: string) => Math.round((parseFloat(v.replace(/,/g, '')) || 0) * 100)

async function post(rows: unknown[], date: string) {
  const res = await fetch('/api/assets/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, rows }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Couldn’t save')
  return j
}

function MoneyInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block px-1 text-[12px] text-muted">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
        <input inputMode="decimal" value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className="num h-11 w-full rounded-xl border border-line/10 bg-bg pl-7 pr-3 outline-none focus:border-line/25" placeholder="0" />
      </span>
    </label>
  )
}

/* ---------- add an account ---------- */

export function AddAccountButton({ big, preset }: { big?: boolean; preset?: [string, string] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(preset?.[0] || '')
  const [kind, setKind] = useState(preset?.[1] || 'mutual_fund')
  const [invested, setInvested] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const isLoan = kind === 'loan'
  const flat = kind === 'bank'

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const inv = toPaise(invested)
      const val = flat ? toPaise(value) : value ? toPaise(value) : inv
      await post([{ name, kind, invested: flat ? val : inv, value: val }], todayKey())
      toast(`Added ${name.trim()}`)
      setOpen(false); setName(''); setInvested(''); setValue('')
      router.refresh()
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const trigger = preset
    ? <Chip onClick={() => { setName(preset[0]); setKind(preset[1]); setOpen(true) }}><Plus size={14} /> {preset[0]}</Chip>
    : big
      ? <PrimaryButton className="w-full" onClick={() => setOpen(true)}><Plus size={18} /> Add an account</PrimaryButton>
      : <SecondaryButton className="h-11 flex-1" onClick={() => setOpen(true)}><Plus size={17} /> Account</SecondaryButton>

  return (
    <>
      {trigger}
      <Sheet open={open} onClose={() => setOpen(false)} title="Add an account">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Axis Bluechip, HDFC savings, PPF" className="field" autoFocus maxLength={60} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KINDS.map(([k, l]) => <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="h-8 text-[13px]">{l}</Chip>)}
        </div>
        <div className="mt-4 flex gap-2">
          {!flat && <MoneyInput label={isLoan ? 'Borrowed' : 'Invested (principal)'} value={invested} onChange={setInvested} />}
          <MoneyInput label={isLoan ? 'Still owed' : flat ? 'Balance' : 'Worth now'} value={value} onChange={setValue} />
        </div>
        <p className="mt-2 px-1 text-[12.5px] text-muted">
          {isLoan ? 'Loans count against your net worth.' : flat ? 'Just the balance — update it whenever you like.' : 'Leave “worth now” empty if it’s the same as what you put in (a new FD, say).'}
        </p>
        <PrimaryButton className="mt-4 w-full" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Add account'}</PrimaryButton>
      </Sheet>
    </>
  )
}

export function StarterChips() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((p) => <AddAccountButton key={p[0]} preset={p} />)}
    </div>
  )
}

/* ---------- monthly update ---------- */

export interface UpdateRow { id: string; name: string; kind: string; kindLabel: string; emoji: string; invested: number; value: number; isLoan: boolean; flat: boolean }

export function UpdateForm({ rows }: { rows: UpdateRow[] }) {
  const router = useRouter()
  const [date, setDate] = useState(todayKey())
  const [vals, setVals] = useState(() => Object.fromEntries(rows.map((r) => [r.id, { invested: rupees(r.invested), value: rupees(r.value) }])))
  const [busy, setBusy] = useState(false)

  const changed = useMemo(() => rows.filter((r) => {
    const v = vals[r.id]
    return (!r.flat && toPaise(v.invested) !== r.invested) || toPaise(v.value) !== r.value
  }), [rows, vals])

  const total = rows.reduce((s, r) => s + (r.isLoan ? -1 : 1) * toPaise(vals[r.id].value), 0)
  const before = rows.reduce((s, r) => s + (r.isLoan ? -1 : 1) * r.value, 0)

  const save = async () => {
    if (!changed.length) { router.push('/wealth'); return }
    setBusy(true)
    try {
      await post(changed.map((r) => ({ assetId: r.id, invested: toPaise(vals[r.id][r.flat ? 'value' : 'invested']), value: toPaise(vals[r.id].value) })), date)
      toast(`Updated ${changed.length} account${changed.length === 1 ? '' : 's'}`)
      router.push('/wealth')
      router.refresh()
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="card flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[14px] text-muted">Values as of</span>
        <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-transparent text-right text-[15px] outline-none" />
      </label>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const v = vals[r.id]
          const dirty = changed.some((c) => c.id === r.id)
          const gain = toPaise(v.value) - toPaise(v.invested)
          return (
            <div key={r.id} className={cn('card p-4 transition-shadow', dirty && 'ring-1 ring-invest/50')}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[17px]">{r.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                {dirty && <Check size={16} className="text-invest" />}
                {!r.isLoan && !r.flat && toPaise(v.invested) > 0 && (
                  <span className={cn('num text-[12.5px]', gain >= 0 ? 'text-pos' : 'text-neg')}>{gain >= 0 ? '+' : '−'}{inr(Math.abs(gain), { decimals: 'never' })}</span>
                )}
              </div>
              <div className="flex gap-2">
                {!r.flat && <MoneyInput label={r.isLoan ? 'Borrowed' : 'Invested'} value={v.invested} onChange={(x) => setVals((s) => ({ ...s, [r.id]: { ...s[r.id], invested: x } }))} />}
                <MoneyInput label={r.isLoan ? 'Still owed' : r.flat ? 'Balance' : 'Worth now'} value={v.value} onChange={(x) => setVals((s) => ({ ...s, [r.id]: { ...s[r.id], value: x } }))} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="card flex items-center justify-between p-4">
        <span className="text-[14px] text-muted">Net worth</span>
        <span className="text-right">
          <span className="num block text-[18px] font-semibold">{inr(total, { decimals: 'never' })}</span>
          {total !== before && <span className={cn('num block text-[12.5px]', total > before ? 'text-pos' : 'text-neg')}>{total > before ? '+' : '−'}{inr(Math.abs(total - before), { decimals: 'never' })}</span>}
        </span>
      </div>
      <PrimaryButton className="w-full" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Nothing changed'}
      </PrimaryButton>
      <p className="px-1 text-center text-[12.5px] text-muted">Only accounts you change get a new entry in their history.</p>
    </div>
  )
}

/* ---------- account detail actions ---------- */

export function AccountActions({ id, name, kind, archived }: { id: string; name: string; kind: string; archived: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [n, setN] = useState(name)
  const [k, setK] = useState(kind)
  const patch = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/assets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { toast('Couldn’t save', { tone: 'error' }); return false }
    router.refresh()
    return true
  }
  return (
    <div className="flex gap-2">
      <SecondaryButton className="h-11 flex-1" onClick={() => setOpen(true)}>Rename</SecondaryButton>
      <SecondaryButton className="h-11 flex-1" onClick={async () => { if (await patch({ archived: !archived })) toast(archived ? 'Back in your net worth' : 'Archived — hidden from net worth') }}>
        {archived ? <><ArchiveRestore size={16} /> Unarchive</> : <><Archive size={16} /> Archive</>}
      </SecondaryButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit account">
        <input value={n} onChange={(e) => setN(e.target.value)} className="field" maxLength={60} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KINDS.map(([kk, l]) => <Chip key={kk} active={k === kk} onClick={() => setK(kk)} className="h-8 text-[13px]">{l}</Chip>)}
        </div>
        <PrimaryButton className="mt-4 w-full" onClick={async () => { if (await patch({ name: n, kind: k })) setOpen(false) }}>Save</PrimaryButton>
      </Sheet>
    </div>
  )
}

export function DeleteSnapshotButton({ id }: { id: string }) {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        if (!confirm('Delete this update? The account goes back to the previous values.')) return
        const res = await fetch(`/api/assets/snapshots/${id}`, { method: 'DELETE' })
        if (!res.ok) { toast('Couldn’t delete', { tone: 'error' }); return }
        toast('Update deleted')
        router.refresh()
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-sunken hover:text-danger" aria-label="Delete this update">
      <Trash2 size={14} />
    </button>
  )
}
