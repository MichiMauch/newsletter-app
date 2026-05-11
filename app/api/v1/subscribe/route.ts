import { createSubscriber } from '@/lib/newsletter'
import { getListsBySlugs } from '@/lib/lists'
import { sendConfirmationEmail, sendAlreadySubscribedEmail } from '@/lib/notify'
import { getSiteConfig } from '@/lib/site-config'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidEmail } from '@/lib/validators'

const SUBSCRIBE_MAX_REQUESTS = 5
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// Per-email cap: stops "email bombing" where an attacker rotates source IPs
// (or spoofs X-Forwarded-For) to flood a single victim address with
// confirmation mails using our warmed-up sender domain.
const SUBSCRIBE_EMAIL_MAX_REQUESTS = 3
const SUBSCRIBE_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

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

    const body = await request.json() as { email?: unknown; siteId?: unknown; listSlugs?: unknown; listSlug?: unknown }
    const email = body.email
    const siteId = typeof body.siteId === 'string' ? body.siteId : 'kokomo'

    if (!ALLOWED_SITE_IDS.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Ungültige Site-ID.' }), { status: 400, headers })
    }

    if (typeof email !== 'string' || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }), { status: 400, headers })
    }
    const normalized = email.trim().toLowerCase()

    // listSlugs PFLICHT — kein implizites Default mehr. Akzeptiert sowohl
    // listSlugs: ['x', 'y'] als auch listSlug: 'x' als Komfort-Alias.
    const slugSet = new Set<string>()
    if (Array.isArray(body.listSlugs)) {
      for (const v of body.listSlugs) if (typeof v === 'string' && v.trim()) slugSet.add(v.trim())
    }
    if (typeof body.listSlug === 'string' && body.listSlug.trim()) {
      slugSet.add(body.listSlug.trim())
    }
    const slugs = [...slugSet]
    if (slugs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'listSlugs (oder listSlug) ist erforderlich.' }),
        { status: 400, headers },
      )
    }

    const { found, missing } = await getListsBySlugs(siteId, slugs)
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Unbekannte Listen: ${missing.join(', ')}` }),
        { status: 400, headers },
      )
    }
    const listIds = found.map((l) => l.id)

    // Second-layer rate-limit keyed on the target email. Defends against
    // email-bombing where the attacker rotates source IPs/XFF to flood a
    // single victim address with confirmation mails.
    const { allowed: emailAllowed } = await checkRateLimit(
      `subscribe:email:${normalized}`,
      SUBSCRIBE_EMAIL_MAX_REQUESTS,
      SUBSCRIBE_EMAIL_WINDOW_MS,
    )
    if (!emailAllowed) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }), { status: 429, headers })
    }

    const userAgent = request.headers.get('user-agent') ?? null
    const result = await createSubscriber(siteId, normalized, { ip, userAgent }, { listIds })
    const site = await getSiteConfig(siteId)

    if (result.alreadyConfirmed) {
      sendAlreadySubscribedEmail(site, { email: normalized, token: result.token }).catch((err) =>
        console.error('[newsletter] already-subscribed email failed:', err),
      )
    } else {
      sendConfirmationEmail(site, { email: normalized, unsubscribeToken: result.token }).catch((err) =>
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
