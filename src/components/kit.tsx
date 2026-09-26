'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inr, NEED_META, type Need } from '@/lib/format'

/* ---------- Money ---------- */

export function Money({ paise, tone, className, decimals }: {
  paise: number
  tone?: 'auto' | 'pos' | 'neg' | 'muted'
  className?: string
  decimals?: 'auto' | 'always' | 'never'
}) {
  const t = tone === 'auto' ? (paise > 0 ? 'pos' : paise < 0 ? 'neg' : 'muted') : tone
  return (
    <span className={cn('num', t === 'pos' && 'text-pos', t === 'neg' && 'text-neg', t === 'muted' && 'text-muted', className)}>
      {inr(tone === 'auto' ? Math.abs(paise) : paise, { decimals })}
    </span>
  )
}

/** "owes you ₹450" / "you owe ₹200" / "settled up" from your point of view (net > 0 = they owe you). */
export function BalanceLine({ net, className }: { net: number; className?: string }) {
  if (net === 0) return <span className={cn('text-muted', className)}>settled up</span>
  return (
    <span className={cn(net > 0 ? 'text-pos' : 'text-neg', className)}>
      {net > 0 ? 'owes you ' : 'you owe '}
      <span className="num font-semibold">{inr(Math.abs(net))}</span>
    </span>
  )
}

/* ---------- Avatar ---------- */

function hue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function Avatar({ name, id, size = 40, className }: { name: string; id?: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const h = hue(id || name)
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', className)}
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: `hsl(${h} 45% 88%)`, color: `hsl(${h} 35% 30%)`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

/* ---------- Need level ---------- */

export function NeedDot({ need, className }: { need: Need; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: NEED_META[need].color }} />
}

/* ---------- Chips & segmented ---------- */

export function Chip({ active, onClick, children, className, dot }: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
  dot?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'pressable inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] transition-colors',
        active ? 'border-ink bg-ink text-ink-fg' : 'border-line/10 bg-card text-fg hover:border-line/20',
        className,
      )}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('flex rounded-2xl bg-sunken p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-xl px-3 text-[14px] font-medium transition',
            value === o.value ? 'bg-raised text-fg shadow-[var(--shadow-soft)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Buttons ---------- */

export function PrimaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'pressable inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-medium text-ink-fg transition-opacity disabled:opacity-40',
        className,
      )}
    />
  )
}

export function SecondaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'pressable inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line/10 bg-card px-5 font-medium text-fg disabled:opacity-40',
        className,
      )}
    />
  )
}

/* ---------- Layout ---------- */

export function PageHeader({ title, back, action, subtitle }: {
  title: ReactNode
  back?: string | true
  action?: ReactNode
  subtitle?: ReactNode
}) {
  const router = useRouter()
  return (
    <header className="mb-5 flex items-start gap-2">
      {back && (
        typeof back === 'string' ? (
          <Link href={back} className="-ml-2 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Back">
            <ChevronLeft size={22} />
          </Link>
        ) : (
          <button onClick={() => router.back()} className="-ml-2 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg" aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        )
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1">
          {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-xs text-[14px] text-muted">{children}</div>}
    </div>
  )
}

/* ---------- Sheet ---------- */

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-lg animate-sheet-in overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-float)] sm:rounded-[28px] sm:pb-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-fg/15 sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-muted" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/* ---------- Toast ---------- */

type ToastMsg = { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } }

export function toast(text: string, opts: { tone?: 'ok' | 'error'; action?: ToastMsg['action'] } = {}) {
  window.dispatchEvent(new CustomEvent('fs-toast', { detail: { text, tone: opts.tone || 'ok', action: opts.action } }))
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => {
    let n = 0
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail
      const id = ++n
      setItems((xs) => [...xs.slice(-2), { id, ...d }])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.action ? 6000 : 3200)
    }
    window.addEventListener('fs-toast', on)
    return () => window.removeEventListener('fs-toast', on)
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-md animate-rise-in items-center gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-[var(--shadow-float)]',
            t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-ink-fg',
          )}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold underline-offset-2 hover:underline"
              onClick={() => { t.action!.run(); setItems((xs) => xs.filter((x) => x.id !== t.id)) }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------- misc ---------- */

export function Row({ href, onClick, children, className }: { href?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fg/[0.025] active:bg-fg/[0.05]', className)
  if (href) return <Link href={href} className={cls}>{children}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{children}</button>
  return <div className={cls}>{children}</div>
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card divide-y divide-line/[0.07] overflow-hidden', className)}>{children}</div>
}
