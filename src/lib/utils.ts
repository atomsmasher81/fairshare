import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format amount from paise to display string
export function formatAmount(paise: number, currency: string = 'INR'): string {
  const amount = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Parse amount string to paise
export function parseAmount(amountStr: string): number {
  const amount = parseFloat(amountStr)
  if (isNaN(amount)) return 0
  return Math.round(amount * 100)
}

// Format date for display
export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Format relative time
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(d)
}

// Category options
export const EXPENSE_CATEGORIES = [
  { value: 'food', label: '🍕 Food & Drinks' },
  { value: 'travel', label: '🚗 Travel' },
  { value: 'utilities', label: '💡 Utilities' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'shopping', label: '🛒 Shopping' },
  { value: 'rent', label: '🏠 Rent' },
  { value: 'other', label: '📦 Other' },
]

export function getCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label || '📦 Other'
}
