'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { AddFriendSheet } from '@/components/expense-editor'

export function AddFriendButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="pressable flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-ink-fg">
        <UserPlus size={16} /> Add
      </button>
      <AddFriendSheet open={open} onClose={() => setOpen(false)} onAdded={(f) => router.push(`/friends/${f.id}`)} />
    </>
  )
}
