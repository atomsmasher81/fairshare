import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AnimatedFavicon } from '@/components/animated-favicon'
import { SITE } from '@/lib/site'

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

const DESCRIPTION = 'Free, open-source Splitwise alternative you can self-host. Split bills with friends and groups, track personal spending as essential / semi / luxury, add expenses by voice with Siri, and settle up over UPI.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'FairShare — open-source Splitwise alternative with expense tracking', template: '%s · FairShare' },
  description: DESCRIPTION,
  applicationName: 'FairShare',
  keywords: ['Splitwise alternative', 'open source Splitwise', 'self-hosted expense splitter', 'split bills with friends', 'expense tracker', 'personal finance', 'UPI', 'PWA', 'Siri shortcut', 'MCP'],
  authors: [{ name: SITE.author, url: SITE.authorUrl }],
  creator: SITE.author,
  openGraph: {
    type: 'website',
    siteName: 'FairShare',
    title: 'FairShare — open-source Splitwise alternative',
    description: DESCRIPTION,
    url: SITE.url,
  },
  twitter: { card: 'summary_large_image', title: 'FairShare — open-source Splitwise alternative', description: DESCRIPTION },
  alternates: { canonical: '/' },
  appleWebApp: { capable: true, title: 'FairShare', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: '/icon.gif', type: 'image/gif' }], apple: '/apple-icon.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#11110f' },
  ],
}

// Applies the saved theme before first paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-bg font-sans text-fg antialiased`}>
        {children}
        <AnimatedFavicon />
      </body>
    </html>
  )
}
