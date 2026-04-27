import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from './sentry.shared'
import { assertEnvOrExit } from './lib/env-check'

export async function register() {
  // Validate critical env vars *before* anything else — a deploy missing e.g.
  // CONFIRM_TOKEN_SECRET would otherwise come up apparently fine and silently
  // fail every confirmation send. exit(1) makes Coolify mark the deploy as
  // failed so the operator notices in seconds, not after the first signup.
  // Edge runtime can't process.exit, so only enforce on node.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    assertEnvOrExit()
  }

  if (!sentryConfig.enabled) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryConfig)
  }
}

export const onRequestError = Sentry.captureRequestError
