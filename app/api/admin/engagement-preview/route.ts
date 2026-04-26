import { isAuthenticated } from '@/lib/admin-auth'
import { predictEngagement } from '@/lib/engagement-prediction'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ungültiger Body.' }, { status: 400 })
  }

  const { slugs, tags } = (body ?? {}) as { slugs?: unknown; tags?: unknown }
  const safeSlugs = Array.isArray(slugs) ? slugs.filter((s): s is string => typeof s === 'string') : []
  const safeTags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : []

  try {
    const prediction = await predictEngagement(SITE_ID, { slugs: safeSlugs, tags: safeTags })
    return Response.json(prediction)
  } catch (err: unknown) {
    console.error('[engagement-preview]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
