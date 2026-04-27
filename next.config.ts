import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Allow tests (or parallel runs) to point at a separate build dir so the
  // dev-server lockfile doesn't clash with a developer's running `npm run dev`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Next.js 16 blocks cross-origin requests in dev unless the origin is listed
  // here. Playwright reaches the dev server via 127.0.0.1, which counts as a
  // different origin from `localhost` — list both so either works.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

// withSentryConfig handles source-map upload + tunnel route. When
// SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT are unset, the upload
// step is skipped silently so local builds keep working.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Tunnel SDK requests through this app to bypass ad-blockers.
  tunnelRoute: "/monitoring",
  disableLogger: true,
  // Skip telemetry beacons + source-map upload locally — uploads only run when
  // SENTRY_AUTH_TOKEN is set anyway, but the option here keeps build noise low.
  telemetry: false,
});
