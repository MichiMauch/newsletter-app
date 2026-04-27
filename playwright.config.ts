import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // Single worker because we share one SQLite test DB and one fake-Resend
  // capture file across the run — parallelism would cause cross-test pollution.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The wrapper loads .env.test, resets+migrates the SQLite test DB, then
    // spawns `next dev`. We pass PLAYWRIGHT_PORT through the env so a future
    // override stays consistent.
    command: `npx tsx scripts/e2e-server.ts`,
    env: { PLAYWRIGHT_PORT: String(PORT) },
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
