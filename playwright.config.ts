import { defineConfig, devices } from '@playwright/test'

// Supabase URL/key for the API-level checks.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: use variables from the environment
}

/**
 * End-to-end tests against a running app (npm run build && npm start, or npm run dev).
 * They need two confirmed test users — see tests/e2e/README.md.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    screenshot: 'only-on-failure',
    // Optional: send the browser through an outbound proxy (e.g. a sandbox that only reaches
    // Supabase storage through one). Off unless E2E_BROWSER_PROXY is set.
    ...(process.env.E2E_BROWSER_PROXY
      ? { proxy: { server: process.env.E2E_BROWSER_PROXY, bypass: 'localhost,127.0.0.1' }, ignoreHTTPSErrors: true }
      : {}),
  },
  projects: [
    // Phones are the main target, so the journey runs at phone size.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
