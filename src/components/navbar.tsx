'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ListOrdered, Plus, Users, CircleUser } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/activity', label: 'Activity', icon: ListOrdered },
  { href: '/add', label: 'Add', icon: Plus, primary: true },
  { href: '/friends', label: 'Friends', icon: Users, also: ['/groups'] },
  { href: '/settings', label: 'You', icon: CircleUser },
]

/** Where "+" should prefill: on a friend or group page, add straight into it. */
function addHref(pathname: string) {
  const friend = pathname.match(/^\/friends\/([^/]+)$/)?.[1]
  if (friend) return `/add?friend=${friend}`
  const group = pathname.match(/^\/groups\/([^/]+)$/)?.[1]
  if (group && group !== 'new') return `/add?group=${group}`
  return '/add'
}

export function Navbar() {
  const pathname = usePathname()
  if (pathname.startsWith('/add') || pathname.startsWith('/expense/')) return null
  const active = (t: (typeof TABS)[number]) =>
    pathname === t.href || pathname.startsWith(t.href + '/') || (t.also || []).some((p) => pathname.startsWith(p))

  return (
    <>
      {/* Desktop: slim top bar */}
      <nav className="sticky top-0 z-40 hidden border-b border-line/[0.07] bg-bg/80 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/home" className="text-[17px] font-semibold tracking-[-0.03em]">FairShare</Link>
          <div className="flex items-center gap-1">
            {TABS.filter((t) => !t.primary).map((t) => (
              <Link key={t.href} href={t.href}
                className={cn('rounded-full px-3.5 py-1.5 text-[14px] transition-colors',
                  active(t) ? 'bg-sunken font-medium text-fg' : 'text-muted hover:text-fg')}>
                {t.label}
              </Link>
            ))}
            <Link href={addHref(pathname)} className="pressable ml-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[14px] font-medium text-ink-fg">
              <Plus size={16} strokeWidth={2.5} /> Add
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile: floating tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto flex h-16 max-w-sm items-center justify-around rounded-[26px] border border-line/[0.07] bg-card/85 px-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
          {TABS.map((t) => {
            const Icon = t.icon
            if (t.primary) {
              return (
                <Link key={t.href} href={addHref(pathname)} aria-label="Add expense"
                  className="pressable flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-ink-fg">
                  <Icon size={24} strokeWidth={2.4} />
                </Link>
              )
            }
            const on = active(t)
            return (
              <Link key={t.href} href={t.href} className={cn('flex w-14 flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium', on ? 'text-fg' : 'text-faint')}>
                <Icon size={22} strokeWidth={on ? 2.3 : 1.8} />
                {t.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
