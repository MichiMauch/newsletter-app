import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from './sentry.shared'

export async function register() {
  if (!sentryConfig.enabled) return

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryConfig)
  }
}

export const onRequestError = Sentry.captureRequestError
