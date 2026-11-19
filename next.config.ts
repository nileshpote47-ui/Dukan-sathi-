import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every dashboard page reads the auth cookie
  // and must render per request. See docs/ARCHITECTURE.md ("Rendering and caching").
  cacheComponents: false,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Posters and photos are uploaded through Server Actions. Files are capped at 3.5 MB
      // (MEDIA_MAX_BYTES) and checked on the server; Vercel allows at most 4.5 MB per request.
      bodySizeLimit: '4mb',
    },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HTTPS only (Vercel serves HTTPS; browsers ignore this header on plain HTTP/localhost).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
