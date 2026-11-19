import type { MetadataRoute } from 'next'
import { publicSiteUrl, SITEMAP_ROUTES } from '@/lib/config/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteUrl()
  return SITEMAP_ROUTES.map((path) => ({ url: `${base}${path === '/' ? '' : path}`, changeFrequency: 'monthly', priority: path === '/' ? 1 : 0.5 }))
}
