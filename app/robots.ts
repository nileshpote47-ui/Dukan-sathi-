import type { MetadataRoute } from 'next'
import { publicSiteUrl } from '@/lib/config/site'

export default function robots(): MetadataRoute.Robots {
  const base = publicSiteUrl()
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/onboarding', '/admin', '/api/', '/auth/'] },
    sitemap: `${base}/sitemap.xml`,
  }
}
