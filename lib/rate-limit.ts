/**
 * DB-backed rate limiter with two-bucket sliding window.
 *
 * The original implementation used a fixed window aligned to the wall clock,
 * which allowed a 2× burst at window boundaries. We now interpolate a
 * weighted previous-bucket count into the current bucket, which approximates
 * a true sliding window without per-event timestamp storage.
 */

import { getDb } from './db'
import { rateLimits } from './schema'
import { and, eq, lt, sql } from 'drizzle-orm'

interface RateLimitResult {
  allowed: boolean
  remaining: number
}

/**
 * Check and increment a rate limit counter.
 *
 * @param key - Unique identifier (e.g. "login:1.2.3.4")
 * @param maxRequests - Maximum requests per window
 * @param windowMs - Window size in milliseconds
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const db = getDb()
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const prevWindowStart = windowStart - windowMs

  // Prune anything older than the previous window — we still need the
  // immediately previous window for the sliding-window calculation.
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, prevWindowStart))

  // Increment the current bucket
  await db.insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })

  // Read current and previous bucket counts in parallel
  const [currRows, prevRows] = await Promise.all([
    db.select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
      .limit(1),
    db.select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, prevWindowStart)))
      .limit(1),
  ])

  const currCount = currRows[0]?.count ?? 0
  const prevCount = prevRows[0]?.count ?? 0

  // Interpolate previous-window contribution by remaining time-fraction.
  // If we are 30% into the current window, we count 70% of the prev bucket.
  const elapsedFraction = (now - windowStart) / windowMs
  const weightedCount = currCount + prevCount * (1 - elapsedFraction)

  return {
    allowed: weightedCount <= maxRequests,
    remaining: Math.max(0, maxRequests - Math.ceil(weightedCount)),
  }
}

/**
 * Extract client IP from request headers.
 *
 * Coolify/Traefik (and most reverse proxies) APPEND the real client IP to
 * any inbound `X-Forwarded-For` rather than replacing it. The right-most
 * entry is therefore the value the *first trusted proxy* observed; the
 * left-most entry is attacker-supplied.
 *
 * We respect `TRUSTED_PROXY_HOPS` (defaults to 1) and pick the entry that
 * many positions from the right.
 */
export function getClientIp(request: Request): string {
  return getClientIpFromHeaders((name) => request.headers.get(name))
}

// Same trusted-proxy logic as getClientIp(), but works against any header
// source — used from Server Components where there is no Request object.
export function getClientIpFromHeaders(getHeader: (name: string) => string | null | undefined): string {
  const hops = parseTrustedHops(process.env.TRUSTED_PROXY_HOPS)

  const xff = getHeader('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    const idx = parts.length - hops
    if (idx >= 0 && parts[idx]) return parts[idx]
  }

  const realIp = getHeader('x-real-ip')?.trim()
  if (realIp) return realIp

  return 'unknown'
}

function parseTrustedHops(raw: string | undefined): number {
  if (!raw) return 1
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}
