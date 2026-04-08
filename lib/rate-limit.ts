/**
 * Simple DB-backed rate limiter using sliding windows.
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

  // Clean old windows
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, windowStart))

  // Upsert current window
  await db.insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })

  // Read current count
  const rows = await db.select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1)

  const count = rows[0]?.count ?? 0
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  }
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}
