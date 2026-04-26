import { isAuthenticated } from '@/lib/admin-auth'
import { getNewsletterTrends, getSubscriberGrowth } from '@/lib/newsletter'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  try {
    const [trends, subscriberGrowth] = await Promise.all([
      getNewsletterTrends(SITE_ID),
      getSubscriberGrowth(SITE_ID),
    ])

    return Response.json({ trends, subscriberGrowth })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
