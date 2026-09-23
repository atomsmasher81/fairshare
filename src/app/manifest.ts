import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FairShare',
    short_name: 'FairShare',
    description: 'Personal expenses + splits with friends',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f2f1ed',
    theme_color: '#f2f1ed',
    icons: [
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/icon', sizes: '512x512', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Add expense', url: '/add' },
      { name: 'Friends', url: '/friends' },
    ],
  }
}
