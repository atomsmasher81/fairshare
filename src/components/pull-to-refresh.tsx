'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const THRESHOLD = 72 // px of (dampened) pull needed to refresh
const MAX = 110

/**
 * Pull down at the top of a page to refetch it. Installed iPhone web apps have no native
 * pull-to-refresh, so this re-runs the page's server data with router.refresh().
 */
export function PullToRefresh() {
  const router = useRouter()
  const pathname = usePathname()
  const [pull, setPull] = useState(0)
  const [pending, startTransition] = useTransition()
  const [spinning, setSpinning] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const pullRef = useRef(0)

  const disabled = pathname.startsWith('/add') || pathname.startsWith('/expense/')

  useEffect(() => {
    if (disabled) return
    const onStart = (e: TouchEvent) => {
      // Only from the very top, never while a sheet is open (it locks body scroll)
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden' || e.touches.length !== 1) { start.current = null; return }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      active.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dx = e.touches[0].clientX - start.current.x
      const dy = e.touches[0].clientY - start.current.y
      if (!active.current) {
        if (Math.abs(dx) > Math.abs(dy) || dy < 6) { if (Math.abs(dx) > 10 || dy < -6) start.current = null; return }
        if (window.scrollY > 0) { start.current = null; return }
        active.current = true
      }
      const dampened = Math.min(MAX, dy * 0.5)
      pullRef.current = Math.max(0, dampened)
      setPull(pullRef.current)
    }
    const onEnd = () => {
      if (active.current && pullRef.current >= THRESHOLD) {
        setSpinning(true)
        if (navigator.vibrate) navigator.vibrate(8)
        startTransition(() => router.refresh())
      }
      start.current = null
      active.current = false
      pullRef.current = 0
      setPull(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [disabled, router])

  // Keep the spinner up until the fresh data has rendered (and at least briefly, so it registers)
  useEffect(() => {
    if (!spinning || pending) return
    const t = setTimeout(() => setSpinning(false), 350)
    return () => clearTimeout(t)
  }, [spinning, pending])

  if (disabled) return null
  const visible = pull > 4 || spinning
  const ready = pull >= THRESHOLD
  const offset = spinning ? THRESHOLD * 0.75 : pull * 0.75

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(calc(env(safe-area-inset-top) + ${offset - 44}px))`,
        opacity: visible ? Math.min(1, (spinning ? 1 : pull / THRESHOLD)) : 0,
        transition: pull > 0 ? 'none' : 'transform 220ms ease, opacity 220ms ease',
      }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-[var(--shadow-float)]">
        {spinning ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-fg/15 border-t-fg" aria-label="Refreshing" />
        ) : (
          <ArrowDown size={18} className={cn('text-muted transition-transform duration-150', ready && 'rotate-180 text-fg')} />
        )}
      </div>
    </div>
  )
}
