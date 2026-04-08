import { createSubscriber } from '@/lib/newsletter'
import { sendConfirmationEmail, sendAlreadySubscribedEmail } from '@/lib/notify'
import { getSiteConfig } from '@/lib/site-config'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const SUBSCRIBE_MAX_REQUESTS = 5
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const ALLOWED_ORIGINS = [
  'https://www.kokomo.house',
  'https://kokomo.house',
]

const ALLOWED_SITE_IDS = ['kokomo']

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
    const { allowed } = await checkRateLimit(`subscribe:${ip}`, SUBSCRIBE_MAX_REQUESTS, SUBSCRIBE_WINDOW_MS)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }), { status: 429, headers })
    }

    const { email, siteId = 'kokomo' } = await request.json()

    if (!ALLOWED_SITE_IDS.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Ungültige Site-ID.' }), { status: 400, headers })
    }

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }), { status: 400, headers })
    }

    const normalized = email.toLowerCase().trim()
    // RFC 5321: max 254 chars, must have local@domain with at least one dot in domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (normalized.length > 254 || !emailRegex.test(normalized)) {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }), { status: 400, headers })
    }
    const result = await createSubscriber(siteId, normalized)
    const site = await getSiteConfig(siteId)

    if (result.alreadyConfirmed) {
      sendAlreadySubscribedEmail(site, { email: normalized }).catch((err) =>
        console.error('[newsletter] already-subscribed email failed:', err),
      )
    } else {
      sendConfirmationEmail(site, { email: normalized, token: result.token }).catch((err) =>
        console.error('[newsletter] confirmation email failed:', err),
      )
    }

    return new Response(
      JSON.stringify({ message: 'Fast geschafft! Bitte bestätige deine Anmeldung per E-Mail.' }),
      { status: 200, headers },
    )
  } catch (err) {
    console.error('[subscribe POST]', err)
    return new Response(JSON.stringify({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }), { status: 500, headers })
  }
}
