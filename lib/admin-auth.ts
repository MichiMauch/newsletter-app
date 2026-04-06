/**
 * Admin authentication helpers
 * Uses cryptographically random session tokens stored in-memory.
 * Tokens expire after 7 days.
 */

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
const activeSessions = new Map<string, number>() // token → expiry timestamp

export function createSession(): string {
  // Clean expired sessions
  const now = Date.now()
  for (const [token, expiry] of activeSessions) {
    if (expiry < now) activeSessions.delete(token)
  }

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  activeSessions.set(token, now + SESSION_TTL)
  return token
}

export function isValidSession(token: string): boolean {
  const expiry = activeSessions.get(token)
  if (!expiry) return false
  if (Date.now() > expiry) {
    activeSessions.delete(token)
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
