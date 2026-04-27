import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from './sentry.shared'

if (sentryConfig.enabled) {
  Sentry.init(sentryConfig)
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
