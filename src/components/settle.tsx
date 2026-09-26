'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Share2, ExternalLink, BellRing } from 'lucide-react'
import { inr, todayKey } from '@/lib/format'
import { Chip, PrimaryButton, SecondaryButton, Segmented, Sheet, toast } from '@/components/kit'
import { cn } from '@/lib/utils'

function upiLink(vpa: string, name: string, paise: number, note = 'FairShare settle up') {
  const q = new URLSearchParams({ pa: vpa, pn: name, cu: 'INR', tn: note, am: (paise / 100).toFixed(2) })
  return `upi://pay?${q.toString()}`
}

/**
 * Record a payment with a friend. `net` > 0 means they owe you.
 * When you owe and they have a UPI ID, offers a one-tap UPI deep link first.
 */
export function SettleUp({ friend, net, methods, groupId, label, className, variant = 'primary' }: {
  friend: { id: string; name: string; upiId: string | null }
  net: number
  methods: { id: string; name: string }[]
  groupId?: string
  label?: string
  className?: string
  variant?: 'primary' | 'secondary'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<'i_paid' | 'they_paid'>(net < 0 ? 'i_paid' : 'they_paid')
  const [amount, setAmount] = useState(net ? String(Math.abs(net) / 100) : '')
  const [methodId, setMethodId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const paise = Math.round((parseFloat(amount) || 0) * 100)
  const first = friend.name.split(' ')[0]

  const save = async () => {
    if (paise <= 0) return
    setBusy(true)
    const res = await fetch('/api/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: friend.id, direction, amount: paise, date: todayKey(), paymentMethodId: direction === 'i_paid' ? methodId : null, groupId }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'Couldn’t save', { tone: 'error' }); return }
    toast(direction === 'i_paid' ? `Recorded: you paid ${first} ${inr(paise)}` : `Recorded: ${first} paid you ${inr(paise)}`)
    setOpen(false)
    router.refresh()
  }

  const Btn = variant === 'primary' ? PrimaryButton : SecondaryButton
  return (
    <>
      <Btn className={className} onClick={() => setOpen(true)}>{label || 'Settle up'}</Btn>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Settle up with ${first}`}>
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[{ value: 'i_paid', label: `I paid ${first}` }, { value: 'they_paid', label: `${first} paid me` }]}
        />
        <div className="relative mt-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[22px] text-muted">₹</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            className="num h-16 w-full rounded-2xl border border-line/10 bg-bg pl-10 pr-4 text-[28px] font-semibold outline-none focus:border-line/25"
            aria-label="Amount"
          />
        </div>
        {net !== 0 && paise !== Math.abs(net) && (
          <button onClick={() => setAmount(String(Math.abs(net) / 100))} className="mt-2 px-1 text-[13px] text-muted underline-offset-2 hover:underline">
            Full balance: {inr(Math.abs(net))}
          </button>
        )}

        {direction === 'i_paid' && methods.length > 0 && (
          <div className="mt-4">
            <p className="label mb-2">Paid with</p>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => <Chip key={m.id} active={methodId === m.id} onClick={() => setMethodId(methodId === m.id ? null : m.id)}>{m.name}</Chip>)}
            </div>
          </div>
        )}

        {direction === 'i_paid' && friend.upiId && paise > 0 && (
          <a href={upiLink(friend.upiId, friend.name, paise)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line/10 font-medium">
            Pay {inr(paise)} with UPI app <ExternalLink size={16} />
          </a>
        )}
        <PrimaryButton className="mt-3 w-full" onClick={save} disabled={busy || paise <= 0}>
          {busy ? 'Saving…' : direction === 'i_paid' ? 'Mark as paid' : 'Mark as received'}
        </PrimaryButton>
        {direction === 'i_paid' && friend.upiId && (
          <p className="mt-2 text-center text-[12px] text-muted">Pay in your UPI app first, then come back and mark it paid.</p>
        )}
      </Sheet>
    </>
  )
}

/** Nudge a friend who owes you — uses the share sheet (WhatsApp etc). */
export function Remind({ name, amount, myUpi }: { name: string; amount: number; myUpi: string | null }) {
  const text = `Hey ${name.split(' ')[0]}, quick reminder — you owe me ${inr(amount)} on FairShare.${myUpi ? ` You can pay me on UPI at ${myUpi}.` : ''} 🙏`
  const go = async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return }
    } catch { return }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }
  return (
    <SecondaryButton onClick={go} className="flex-1"><BellRing size={16} /> Remind</SecondaryButton>
  )
}

export function ShareLink({ url, title, text, className }: { url: string; title?: string; text?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  const [canShare, setCanShare] = useState(false)
  useEffect(() => { setOrigin(window.location.origin); setCanShare('share' in navigator) }, [])
  const full = url.startsWith('/') ? origin + url : url
  const copy = async () => {
    try { await navigator.clipboard.writeText(full) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const share = async () => {
    try { await navigator.share({ title, text, url: full }) } catch {}
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <code className="min-w-0 flex-1 truncate rounded-xl bg-sunken px-3 py-2.5 font-mono text-[12.5px] text-muted">{full.replace(/^https?:\/\//, '')}</code>
      <button onClick={copy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/10" aria-label="Copy link">
        {copied ? <Check size={16} className="text-pos" /> : <Copy size={16} />}
      </button>
      {canShare && (
        <button onClick={share} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-ink-fg" aria-label="Share link">
          <Share2 size={16} />
        </button>
      )}
    </div>
  )
}
