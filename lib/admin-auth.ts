/**
 * Admin authentication helpers
 * Used by all /api/admin/* endpoints
 */

const AUTH_SALT = 'newsletter-admin-salt'

export async function hashSession(password: string, salt: string = AUTH_SALT): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/admin_session=([^;]+)/)
  if (!match) return false

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return false

  const expected = await hashSession(adminPassword)
  return match[1] === expected
}
