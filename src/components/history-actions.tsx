'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Undo2 } from 'lucide-react'
import { toast } from '@/components/kit'
import { cn } from '@/lib/utils'

/** Restore a deleted expense or payment. */
export function RestoreButton({ kind, id, className }: { kind: 'expense' | 'payment'; id: string; className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault(); e.stopPropagation()
        setBusy(true)
        const res = await fetch(kind === 'expense' ? `/api/expenses/${id}/restore` : `/api/settlements/${id}/restore`, { method: 'POST' })
        setBusy(false)
        if (!res.ok) { toast('Couldn’t restore', { tone: 'error' }); return }
        toast(kind === 'expense' ? 'Expense restored' : 'Payment restored')
        router.refresh()
      }}
      className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line/15 px-3 text-[13px] font-medium disabled:opacity-40', className)}
    >
      <RotateCcw size={13} /> Restore
    </button>
  )
}

/** Delete (undo) a recorded payment — soft, restorable. */
export function DeletePaymentButton({ id, label = 'Undo', className }: { id: string; label?: string; className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault(); e.stopPropagation()
        if (!confirm('Delete this payment? Balances go back to how they were. You can restore it later.')) return
        setBusy(true)
        const res = await fetch(`/api/settlements/${id}`, { method: 'DELETE' })
        setBusy(false)
        if (!res.ok) { toast('Couldn’t delete payment', { tone: 'error' }); return }
        toast('Payment deleted', { action: { label: 'Restore', run: async () => { await fetch(`/api/settlements/${id}/restore`, { method: 'POST' }); router.refresh() } } })
        router.refresh()
      }}
      className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line/15 px-3 text-[13px] font-medium text-muted hover:text-danger disabled:opacity-40', className)}
    >
      <Undo2 size={13} /> {label}
    </button>
  )
}
