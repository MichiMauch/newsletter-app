import { updateFirstName } from '@/lib/newsletter-subscribers'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const PROFILE_MAX_REQUESTS = 10
const PROFILE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const ALLOWED_ORIGINS = [
  'https://www.kokomo.house',
  'https://kokomo.house',
]

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request: Request) {
  const headers = corsHeaders(request)

  try {
    const ip = getClientIp(request)
    const { allowed } = await checkRateLimit(`profile:${ip}`, PROFILE_MAX_REQUESTS, PROFILE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), { status: 429, headers })
    }

    const body = await request.json().catch(() => null) as { token?: unknown; firstName?: unknown } | null
    if (!body) {
      return new Response(JSON.stringify({ error: 'Ungültiger Body.' }), { status: 400, headers })
    }

    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token fehlt.' }), { status: 400, headers })
    }

    // firstName may be empty string (= clear) or up to 100 chars
    const rawName = typeof body.firstName === 'string' ? body.firstName : ''
    if (rawName.length > 100) {
      return new Response(JSON.stringify({ error: 'Vorname zu lang (max 100 Zeichen).' }), { status: 400, headers })
    }

    // Reject control characters, tags, and pipe (would break personalization templates)
    if (/[\p{Cc}<>|]/u.test(rawName)) {
      return new Response(JSON.stringify({ error: 'Vorname enthält ungültige Zeichen.' }), { status: 400, headers })
    }

    const ok = await updateFirstName(token, rawName)
    if (!ok) {
      // Same response for "no such token" as for success — avoids exposing
      // whether a token is valid to anyone probing the endpoint.
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch (err) {
    console.error('[profile POST]', err)
    return new Response(JSON.stringify({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }), { status: 500, headers })
  }
}
