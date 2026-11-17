/* Dukan Sathi service worker.
 * Built by the `serviceWorker` plugin in vite.config.ts, which prepends:
 *   const VERSION = '<hash of the build>'
 *   const PRECACHE = [...every file in the build]
 */
/* global VERSION, PRECACHE */
const CACHE = `dukan-sathi-${VERSION}`
const SHELL = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.location).href)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dukan-sathi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // Network first so a new version shows up when online; cached app shell when offline.
    event.respondWith(fetch(request).catch(() => caches.match(SHELL)))
    return
  }

  // Build assets have content hashes in their names, so cache first is safe.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
})
