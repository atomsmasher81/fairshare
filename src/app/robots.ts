import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // Only the landing page is public; everything else needs an account
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/home', '/activity', '/friends', '/groups', '/add', '/expense', '/payment', '/settings', '/claim', '/join', '/admin'] },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
