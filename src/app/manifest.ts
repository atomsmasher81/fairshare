import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FairShare',
    short_name: 'FairShare',
    description: 'Your spending, and who owes whom',
    id: '/home',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f5f1',
    theme_color: '#f6f5f1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Add expense', short_name: 'Add', url: '/add' },
      { name: 'This month', short_name: 'Summary', url: '/activity?view=summary' },
      { name: 'Friends', url: '/friends' },
    ],
  }
}
