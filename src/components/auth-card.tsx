'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Segmented, PrimaryButton } from '@/components/kit'

export function AuthCard({ initialMode = 'signin', claimCode, claimName, next = '/home' }: {
  initialMode?: 'signin' | 'signup'
  claimCode?: string
  claimName?: string
  next?: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>(claimCode ? 'signup' : initialMode)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState(claimName || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const url = claimCode ? `/api/claim/${claimCode}` : mode === 'signin' ? '/api/auth/login' : '/api/auth/register'
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Something went wrong'); return }
      router.push(next)
      router.refresh()
    } catch {
      setError('No connection — try again')
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  return (
    <form onSubmit={submit} className="card w-full p-5 sm:p-6" id="signin">
      {!claimCode && (
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v); setError('') }}
          options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
        />
      )}
      <div className="mt-4 space-y-2.5">
        {signup && (
          <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name" autoComplete="name" required maxLength={40} aria-label="Your name" />
        )}
        <input className="field" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-label="Username" />
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 6 : 1} aria-label="Password" />
      </div>
      {error && <p className="mt-3 px-1 text-[13.5px] text-danger">{error}</p>}
      <PrimaryButton className="mt-4 w-full" disabled={busy}>
        {busy ? 'One sec…' : signup ? (claimCode ? 'Create account & join' : 'Create account') : 'Sign in'}
      </PrimaryButton>
      {signup && <p className="mt-3 text-center text-[12.5px] text-muted">Free. No ads. No limits on how much you add.</p>}
    </form>
  )
}
