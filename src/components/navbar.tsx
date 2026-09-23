'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface NavbarProps {
  username: string
  isAdmin: boolean
}

export function Navbar({ username, isAdmin }: NavbarProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(242,241,237,0.82)] backdrop-blur-xl">
      <div className="app-shell">
        <div className="flex min-h-[72px] items-center justify-between gap-4">
          <Link href="/dashboard" className="flex flex-col leading-none">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              FairShare
            </span>
            <span className="text-lg font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Split with clarity
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/groups/new">
              <Button>+ New Group</Button>
            </Link>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[var(--foreground)] shadow-sm"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-strong)] text-sm font-semibold text-[var(--foreground)]">
                  {username[0].toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium sm:block">{username}</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-[var(--shadow-card)] z-50">
                  <div className="border-b border-[var(--border)] px-3 pb-3 pt-2">
                    <p className="font-medium text-[var(--foreground)]">{username}</p>
                    {isAdmin && <Badge className="mt-2 w-fit">Admin</Badge>}
                  </div>
                  <Link
                    href="/dashboard"
                    className="mt-2 block rounded-xl px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="block rounded-xl px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface)]"
                      onClick={() => setMenuOpen(false)}
                    >
                      Admin Panel
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
