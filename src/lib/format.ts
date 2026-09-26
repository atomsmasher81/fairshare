// Client-safe formatting helpers. Money is always integer paise.

export function inr(paise: number, opts: { decimals?: 'auto' | 'always' | 'never' } = {}) {
  const n = Math.abs(paise) / 100
  const hasFraction = Math.round(n * 100) % 100 !== 0
  const decimals = opts.decimals === 'always' ? 2 : opts.decimals === 'never' ? 0 : hasFraction ? 2 : 0
  const s = n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${paise < 0 ? '−' : ''}₹${s}`
}

/** "₹1.2L", "₹12.4k" for tight spaces */
export function inrShort(paise: number) {
  const n = Math.abs(paise) / 100
  const sign = paise < 0 ? '−' : ''
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`
  if (n >= 1e4) return `${sign}₹${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return inr(paise, { decimals: 'never' })
}

const IST_OFFSET = 5.5 * 3600e3

/** YYYY-MM-DD of a timestamp in India time */
export function istDay(d: Date | string) {
  return new Date(new Date(d).getTime() + IST_OFFSET).toISOString().slice(0, 10)
}

export function todayKey() {
  return istDay(new Date())
}

export function dayLabel(day: string) {
  const today = todayKey()
  const yesterday = istDay(new Date(Date.now() - 86400e3))
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  const d = new Date(`${day}T12:00:00+05:30`)
  const sameYear = day.slice(0, 4) === today.slice(0, 4)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'Asia/Kolkata' })
}

export function shortDate(d: Date | string) {
  const day = istDay(d)
  const label = dayLabel(day)
  if (label === 'Today' || label === 'Yesterday') return label
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

export function relativeTime(d: Date | string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return shortDate(d)
}

export const NEED_META = {
  essential: { label: 'Essential', short: 'Essential', color: 'rgb(var(--essential))' },
  semi: { label: 'Semi-essential', short: 'Semi', color: 'rgb(var(--semi))' },
  luxury: { label: 'Luxury', short: 'Luxury', color: 'rgb(var(--luxury))' },
} as const
export type Need = keyof typeof NEED_META
export const NEEDS: Need[] = ['essential', 'semi', 'luxury']

export const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  food: { label: 'Food & drinks', emoji: '🍽️' },
  groceries: { label: 'Groceries', emoji: '🛒' },
  travel: { label: 'Transport', emoji: '🚕' },
  utilities: { label: 'Bills', emoji: '💡' },
  rent: { label: 'Rent', emoji: '🏠' },
  shopping: { label: 'Shopping', emoji: '🛍️' },
  entertainment: { label: 'Fun', emoji: '🎬' },
  health: { label: 'Health', emoji: '💊' },
  other: { label: 'Other', emoji: '📦' },
}
export const CATEGORIES = Object.keys(CATEGORY_META)
export function categoryMeta(c: string | null | undefined) {
  return CATEGORY_META[c || 'other'] || CATEGORY_META.other
}

export function firstName(name: string) {
  return name.split(' ')[0]
}
