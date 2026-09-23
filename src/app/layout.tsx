import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: 'FairShare - Split Expenses with Friends',
  description: 'Track shared expenses and settle up easily',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[var(--background)] font-sans text-[var(--foreground)] antialiased`}>
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.66),transparent_30%),var(--background)]">
          {children}
        </div>
      </body>
    </html>
  )
}
