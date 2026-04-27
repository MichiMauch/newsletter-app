import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from './sentry.shared'

export async function register() {
  // Validate critical env vars *before* anything else — a deploy missing e.g.
  // CONFIRM_TOKEN_SECRET would otherwise come up apparently fine and silently
  // fail every confirmation send. exit(1) makes Coolify mark the deploy as
  // failed so the operator notices in seconds, not after the first signup.
  //
  // Dynamic import (not top-level) keeps lib/env-check — which calls
  // process.exit — out of the Edge runtime bundle entirely. A static import
  // here triggers the "Node.js API used in Edge Runtime" warning even
  // though the call site is guarded.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnvOrExit } = await import('./lib/env-check')
    assertEnvOrExit()
  }

  if (!sentryConfig.enabled) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryConfig)
  }
}

export const onRequestError = Sentry.captureRequestError
