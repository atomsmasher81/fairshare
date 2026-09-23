'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavbarProps {
  username: string
  isAdmin: boolean
}

const TABS = [
  { href: '/dashboard', label: 'Home', icon: '⌂' },
  { href: '/friends', label: 'Friends', icon: '⇄' },
  { href: '/add', label: 'Add', icon: '+', primary: true },
  { href: '/spending', label: 'Spending', icon: '₹' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export function Navbar({ username, isAdmin }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const active = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Top bar */}
      <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(242,241,237,0.86)] backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="app-shell flex h-14 items-center justify-between gap-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-[-0.04em]">FairShare</Link>
          <div className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href}
                className={cn('rounded-full px-3 py-1.5 text-sm',
                  t.primary ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]'
                    : active(t.href) ? 'bg-[var(--surface-strong)] font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]')}>
                {t.primary ? '+ Add' : t.label}
              </Link>
            ))}
            {isAdmin && <Link href="/admin" className="rounded-full px-3 py-1.5 text-sm text-[var(--muted-foreground)]">Admin</Link>}
            <button onClick={logout} className="ml-2 rounded-full px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--danger)]" title={`Signed in as ${username}`}>
              Sign out
            </button>
          </div>
          <span className="text-sm text-[var(--muted-foreground)] md:hidden">@{username}</span>
        </div>
      </nav>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgba(247,246,241,0.95)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]">
              {t.primary ? (
                <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white shadow-lg">+</span>
              ) : (
                <>
                  <span className={cn('text-lg leading-none', active(t.href) ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]')}>{t.icon}</span>
                  <span className={active(t.href) ? 'font-medium text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>{t.label}</span>
                </>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
