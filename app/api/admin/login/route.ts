import { createSession } from '@/lib/admin-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createHmac, timingSafeEqual } from 'crypto'

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// Global cap acts as a defence-in-depth backstop: even if an attacker rotates
// X-Forwarded-For values to bypass per-IP buckets, the global bucket caps
// total login attempts across all sources.
const LOGIN_GLOBAL_MAX_ATTEMPTS = 50

/**
 * Constant-time password comparison.
 *
 * HMAC both sides with the same key → both buffers are identical length, so
 * `timingSafeEqual` does not need to early-return on length mismatch and the
 * password length is not revealed via timing. Without HMAC the early
 * length-check leaks the admin password length.
 *
 * Falls back to a fresh per-process key when `LOGIN_HMAC_KEY` is unset; that
 * still defeats remote timing attacks since the attacker doesn't know the key.
 */
const HMAC_KEY = process.env.LOGIN_HMAC_KEY ?? randomFallbackKey()

function randomFallbackKey(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString('hex')
}

function safeCompare(a: string, b: string): boolean {
  const aHash = createHmac('sha256', HMAC_KEY).update(a).digest()
  const bHash = createHmac('sha256', HMAC_KEY).update(b).digest()
  return timingSafeEqual(aHash, bHash)
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  try {
    const ip = getClientIp(request)

    // Per-IP and global buckets — both must allow.
    const [perIp, global] = await Promise.all([
      checkRateLimit(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
      checkRateLimit('login:global', LOGIN_GLOBAL_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
    ])
    if (!perIp.allowed || !global.allowed) {
      return new Response(JSON.stringify({ error: 'Zu viele Anmeldeversuche. Bitte warte 15 Minuten.' }), { status: 429, headers })
    }

    const { password } = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword || typeof password !== 'string' || !safeCompare(password, adminPassword)) {
      return new Response(JSON.stringify({ error: 'Falsches Passwort.' }), { status: 401, headers })
    }

    const sessionToken = await createSession()

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${60 * 60 * 24 * 7}`,
      },
    })
  } catch (err) {
    console.error('[admin/login POST]', err)
    return new Response(JSON.stringify({ error: 'Login fehlgeschlagen.' }), { status: 500, headers })
  }
}
