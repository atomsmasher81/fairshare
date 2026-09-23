'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/utils'

interface Props {
  friendId: string
  friendName: string
  net: number            // + they owe you, - you owe them
  upiLink: string | null // to pay them (only when you owe)
  friendHasUpi: boolean
  myUpi: string | null
}

export function SettleButton({ friendId, friendName, net, upiLink, friendHasUpi, myUpi }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paid, setPaid] = useState(false)
  const amt = Math.abs(net)

  const record = async () => {
    if (!confirm(net > 0 ? `Mark ${formatAmount(amt)} received from ${friendName}?` : `Mark ${formatAmount(amt)} paid to ${friendName}?`)) return
    setBusy(true)
    const res = await fetch('/api/friends/settle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }),
    })
    setBusy(false)
    if (res.ok) router.refresh()
  }

  const remind = async () => {
    const pay = myUpi ? `\nUPI: ${myUpi}\nupi://pay?pa=${encodeURIComponent(myUpi)}&am=${(amt / 100).toFixed(2)}&cu=INR` : ''
    const text = `Hey ${friendName}, FairShare says you owe me ${formatAmount(amt)} 🙂${pay}\nhttps://split.kartikgautam.com/friends`
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (net < 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {upiLink ? (
          <a href={upiLink} onClick={() => setPaid(true)} className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white">
            Pay {formatAmount(amt)} via UPI
          </a>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">{friendHasUpi ? '' : `${friendName} hasn’t added a UPI ID`}</span>
        )}
        <button onClick={record} disabled={busy}
          className={`rounded-full border px-4 py-1.5 text-sm ${paid ? 'border-[var(--success)] text-[var(--success)]' : 'border-[var(--border)]'}`}>
          {paid ? 'Done paying? Mark paid' : 'Mark paid'}
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={remind} className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm">
        {copied ? 'Copied!' : 'Remind'}
      </button>
      <button onClick={record} disabled={busy} className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm">
        Mark received
      </button>
    </div>
  )
}
