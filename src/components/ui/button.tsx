import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-[var(--accent)] text-white shadow-[0_12px_30px_rgba(245,78,0,0.16)] hover:bg-[var(--accent-strong)]',
  secondary:
    'bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] hover:text-[var(--accent)] hover:border-[var(--border-strong)]',
  ghost:
    'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
  destructive:
    'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)] hover:bg-[rgba(207,45,86,0.16)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-5 text-sm',
  icon: 'h-10 w-10',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(245,78,0,0.22)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  )
})
