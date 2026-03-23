'use client'

import { useState } from 'react'

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
      // Fallback for older browsers
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
    <div className="bg-white rounded-xl p-5 shadow-sm border">
      <h2 className="font-semibold text-gray-800 mb-3">Invite Friends</h2>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-lg px-4 py-2 font-mono text-sm text-gray-600 truncate">
          {inviteUrl}
        </div>
        <button
          onClick={copyToClipboard}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            copied 
              ? 'bg-green-100 text-green-700' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Share this link with friends to invite them to the group
      </p>
    </div>
  )
}
