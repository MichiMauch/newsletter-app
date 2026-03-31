import { createSubscriber } from '@/lib/newsletter'
import { sendConfirmationEmail } from '@/lib/notify'
import { getSiteConfig } from '@/lib/site-config'

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
    const { email, siteId = 'kokomo' } = await request.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }), { status: 400, headers })
    }

    const normalized = email.toLowerCase().trim()
    const result = await createSubscriber(siteId, normalized)

    if (result.alreadyConfirmed) {
      return new Response(
        JSON.stringify({ message: 'Fast geschafft! Bitte bestätige deine Anmeldung per E-Mail.' }),
        { status: 200, headers },
      )
    }

    const site = await getSiteConfig(siteId)
    sendConfirmationEmail(site, { email: normalized, token: result.token }).catch((err) =>
      console.error('[newsletter] confirmation email failed:', err),
    )

    return new Response(
      JSON.stringify({ message: 'Fast geschafft! Bitte bestätige deine Anmeldung per E-Mail.' }),
      { status: 200, headers },
    )
  } catch (err) {
    console.error('[subscribe POST]', err)
    return new Response(JSON.stringify({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }), { status: 500, headers })
  }
}
