'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface InviteLinkProps {
  code: string
}

export function InviteLink({ code }: InviteLinkProps) {
  const [copied, setCopied] = useState(false)
  
  const inviteUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/join/${code}`
    : `/join/${code}`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = inviteUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite friends</CardTitle>
        <CardDescription>Share this link to bring people into the group instantly.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-mono text-sm text-[var(--muted-foreground)]">
            {inviteUrl}
          </div>
          <Button onClick={copyToClipboard} variant={copied ? 'secondary' : 'default'}>
            {copied ? '✓ Copied!' : 'Copy'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Share this link with friends to invite them to the group
        </p>
      </CardContent>
    </Card>
  )
}
