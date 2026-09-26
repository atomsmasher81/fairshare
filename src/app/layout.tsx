import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AnimatedFavicon } from '@/components/animated-favicon'

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
  title: { default: 'FairShare — your money, and who owes whom', template: '%s · FairShare' },
  description: 'Track what you spend and split bills with friends. Add an expense in two seconds — or just say it to Siri.',
  applicationName: 'FairShare',
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
