/**
 * Admin authentication helpers
 * Uses cryptographically random session tokens stored in the database.
 * Tokens expire after 7 days.
 */

import { getDb } from './db'
import { adminSessions } from './schema'
import { eq, lt } from 'drizzle-orm'

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function createSession(): Promise<string> {
  const db = getDb()
  const now = Date.now()

  // Clean expired sessions
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now))

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')

  await db.insert(adminSessions).values({
    token,
    expiresAt: now + SESSION_TTL,
  })

  return token
}

async function isValidSession(token: string): Promise<boolean> {
  const db = getDb()
  const rows = await db.select().from(adminSessions).where(eq(adminSessions.token, token)).limit(1)
  if (rows.length === 0) return false
  if (Date.now() > rows[0].expiresAt) {
    await db.delete(adminSessions).where(eq(adminSessions.token, token))
    return false
  }
  return true
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/admin_session=([^;]+)/)
  if (!match) return false
  return isValidSession(match[1])
}
