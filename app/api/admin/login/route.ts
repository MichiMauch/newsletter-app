import { createSession } from '@/lib/admin-auth'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { timingSafeEqual } from 'crypto'

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  try {
    const ip = getClientIp(request)
    const { allowed } = await checkRateLimit(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)
    if (!allowed) {
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
