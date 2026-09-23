'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="hidden pr-8 lg:block">
          <p className="eyebrow mb-4">FairShare / clean expense workspace</p>
          <h1 className="text-5xl font-semibold tracking-[-0.06em] text-[var(--foreground)]">
            Split expenses with a calmer, cleaner flow.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[var(--muted-foreground)]">
            Track group spending, balances, and settlements in one warm, focused workspace.
          </p>
          <div className="mt-8 flex gap-3 text-sm text-[var(--muted-foreground)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">Fast group setup</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">Clear balances</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">Simple settle-up</span>
          </div>
        </div>

        <Card className="w-full border-[var(--border-strong)] bg-[rgba(247,246,241,0.88)]">
          <CardHeader className="space-y-3">
            <div className="eyebrow">Welcome back</div>
            <CardTitle className="text-3xl">Sign in to FairShare</CardTitle>
            <CardDescription>Pick up where your group left off.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                  Username
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium text-[var(--accent)] hover:opacity-80">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
