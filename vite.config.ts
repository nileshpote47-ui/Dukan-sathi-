import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Emits sw.js with the full list of built files, so the app loads offline after the first visit.
 * The version is a hash of the build, so each deploy replaces the old cache.
 */
function serviceWorker(): Plugin {
  return {
    name: 'dukan-sathi-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync('public')
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => f !== 'index.html' && !f.endsWith('.map'))
      const template = readFileSync('sw/service-worker.js', 'utf8')

      const hash = createHash('sha256').update(template)
      for (const f of files.sort()) hash.update(f)
      for (const f of publicFiles) hash.update(readFileSync(`public/${f}`))
      const version = hash.digest('hex').slice(0, 12)

      const precache = ['./', ...files.map((f) => `./${f}`)]
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const VERSION = '${version}'\nconst PRECACHE = ${JSON.stringify(precache)}\n${template}`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react(), serviceWorker()],
})
