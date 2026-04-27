/**
 * Shared Sentry configuration used by both server (instrumentation.ts) and
 * edge runtimes. The browser client lives in instrumentation-client.ts.
 *
 * If SENTRY_DSN is unset (e.g. local dev without an account), init() becomes
 * a no-op — captureException calls are silently dropped.
 */

export const sentryConfig = {
  dsn: process.env.SENTRY_DSN,
  // Sample 100 % of errors but only 10 % of perf traces by default — cron-heavy
  // app, transactions blow up quickly otherwise.
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  environment: process.env.NODE_ENV,
  // Don't crash when DSN is missing — silently disable.
  enabled: Boolean(process.env.SENTRY_DSN),
}
