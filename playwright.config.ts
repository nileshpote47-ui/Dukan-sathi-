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
  },
  projects: [
    // Phones are the main target, so the journey runs at phone size.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
