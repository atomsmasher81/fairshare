import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-4 py-2 text-sm text-[var(--foreground)]',
          'placeholder:text-[var(--muted-foreground)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(245,78,0,0.18)] focus-visible:border-[var(--border-strong)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
