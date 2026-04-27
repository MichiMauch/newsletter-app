/**
 * Boot script for Playwright's webServer:
 *  1. Load .env.test
 *  2. Run e2e-setup (reset + migrate + seed)
 *  3. Spawn `next dev --port 3100` with the test env applied
 *
 * Playwright's webServer runs this and waits for the URL to respond. We never
 * fork into next ourselves to keep stdout/stderr passthrough simple.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.test' })

// Deterministic test fallbacks — applied only if .env.test (gitignored) hasn't
// already set them, so a fresh checkout / CI run is self-contained.
process.env.CONFIRM_TOKEN_SECRET ??= 'e2e-deterministic-confirm-token-secret-32+chars'

const PORT = process.env.PLAYWRIGHT_PORT ?? '3100'
const ROOT = path.resolve(__dirname, '..')

async function runSetup(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', path.join(ROOT, 'scripts/e2e-setup.ts')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`e2e-setup exited with code ${code}`))
    })
  })
}

async function main() {
  await runSetup()

  console.log(`[e2e-server] Starting next dev on port ${PORT}…`)
  const next = spawn('npx', ['next', 'dev', '--port', PORT], {
    cwd: ROOT,
    stdio: 'inherit',
    // NEXT_DIST_DIR: separate build dir from a developer's regular `npm run dev`
    // so the dev-server lockfile in `.next/dev/lock` does not collide.
    env: { ...process.env, NEXT_DIST_DIR: '.next-e2e' },
  })

  next.on('exit', (code) => {
    process.exit(code ?? 0)
  })
  process.on('SIGINT', () => next.kill('SIGINT'))
  process.on('SIGTERM', () => next.kill('SIGTERM'))
}

main().catch((err) => {
  console.error('[e2e-server] FAILED:', err)
  process.exit(1)
})
