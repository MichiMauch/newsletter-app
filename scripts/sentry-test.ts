/**
 * One-off: send a test event to Sentry to verify DSN + project wiring.
 * Usage: npx tsx scripts/sentry-test.ts
 *
 * Uses @sentry/node directly so it works outside the Next.js runtime.
 */

import { config } from 'dotenv'
import * as Sentry from '@sentry/node'

config({ path: '.env.local' })

async function main() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.error('SENTRY_DSN ist leer — nichts zu testen.')
    process.exit(1)
  }

  console.log('DSN gefunden, initialisiere Sentry…')
  console.log('  DSN host:', new URL(dsn).host)

  Sentry.init({
    dsn,
    environment: 'local-smoke-test',
    tracesSampleRate: 0,
    debug: true,
  })

  const messageId = Sentry.captureMessage('newsletter-app: Sentry smoke test', 'info')
  const exceptionId = Sentry.captureException(new Error('newsletter-app: Sentry smoke exception'))

  console.log('Message-Event-ID:  ', messageId)
  console.log('Exception-Event-ID:', exceptionId)

  const flushed = await Sentry.flush(10_000)
  console.log('Flush erfolgreich:', flushed)

  if (!flushed) {
    console.error('⚠ Flush hat nicht innerhalb von 10s alle Events durchgeschoben.')
    process.exit(2)
  }

  console.log('Fertig. In Sentry → Issues → Filter "environment:local-smoke-test" prüfen.')
}

main().catch((err) => {
  console.error('Test-Skript fehlgeschlagen:', err)
  process.exit(1)
})
