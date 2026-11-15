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
  // Sentry v11 collects everything by default (cookies, bodies, user info,
  // DB params). This app handles subscriber e-mail addresses, so keep the
  // restrictive v10 behaviour (sendDefaultPii unset) explicitly.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
  },
  // v11 streams spans by default; keep the transaction mode we sampled for.
  traceLifecycle: 'static' as const,
}
