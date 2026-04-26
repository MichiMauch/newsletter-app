import { upsertContentItems } from '@/lib/content'
import { safeEqualStrings } from '@/lib/timing-safe'
import { validateContentItem } from '@/lib/validators'

// Mirror the subscribe endpoint's allow-list. The shared CRON_SECRET is per
// deployment, so without an explicit list of accepted siteIds an authenticated
// caller (or anyone who recovered the secret) could otherwise overwrite
// content for an arbitrary site.
const ALLOWED_SITE_IDS = new Set(['kokomo'])

const ITEMS_MAX = 1000

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), { status: 500, headers })
  }
  const authHeader = request.headers.get('authorization') ?? ''
  if (!safeEqualStrings(authHeader, `Bearer ${cronSecret}`)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  try {
    const { siteId, items } = await request.json()

    if (typeof siteId !== 'string' || !ALLOWED_SITE_IDS.has(siteId)) {
      return new Response(JSON.stringify({ error: 'Ungültige Site-ID.' }), { status: 400, headers })
    }
    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'items[] is required.' }), { status: 400, headers })
    }
    if (items.length > ITEMS_MAX) {
      return new Response(JSON.stringify({ error: `Maximal ${ITEMS_MAX} Items pro Request.` }), { status: 413, headers })
    }

    const validated: NonNullable<ReturnType<typeof validateContentItem>>[] = []
    for (let i = 0; i < items.length; i++) {
      const v = validateContentItem(items[i])
      if (!v) {
        return new Response(JSON.stringify({ error: `Ungültiges Item an Position ${i}.` }), { status: 400, headers })
      }
      validated.push(v)
    }

    const count = await upsertContentItems(siteId, validated)
    return new Response(JSON.stringify({ ok: true, synced: count }), { status: 200, headers })
  } catch (err) {
    console.error('[content-sync POST]', err)
    return new Response(JSON.stringify({ error: 'Content sync failed.' }), { status: 500, headers })
  }
}
