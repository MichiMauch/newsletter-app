import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import {
  getAllSubscribersEnriched,
  getNewsletterSendsWithStats,
  getRecipientsForSend,
  getLinkClicksForSend,
  getSendBlocksJson,
  getOverallNewsletterStats,
  getBounceOverview,
  getVariantsForSend,
} from '@/lib/newsletter'
import { getContentItems } from '@/lib/content'
import { getSiteConfig, DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import {
  actionStoBootstrap,
  actionTestSend,
  actionRetryFailed,
  actionDeleteSubscriber,
  actionUnsubscribeSubscriber,
  actionSyncContent,
  actionCancelScheduled,
  actionSend,
} from '@/lib/newsletter-actions'
import type { PostRef } from '@/lib/newsletter-blocks'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: JSON_HEADERS })
  }

  try {
    const url = new URL(request.url)
    const includePosts = url.searchParams.get('posts') === '1'
    const includeStats = url.searchParams.get('stats') === '1'
    const sendDetailId = url.searchParams.get('sendDetail')
    const wantsBounces = url.searchParams.get('bounces') === '1'

    if (wantsBounces) {
      const overview = await getBounceOverview(SITE_ID)
      return new Response(JSON.stringify({ bounceOverview: overview }), { status: 200, headers: JSON_HEADERS })
    }

    if (sendDetailId) {
      const id = parseInt(sendDetailId, 10)
      if (isNaN(id)) {
        return new Response(JSON.stringify({ error: 'Ungültige sendDetail ID.' }), { status: 400, headers: JSON_HEADERS })
      }
      const [recipients, linkClicks, blocksJson, variants] = await Promise.all([
        getRecipientsForSend(SITE_ID, id),
        getLinkClicksForSend(id),
        getSendBlocksJson(id),
        getVariantsForSend(id),
      ])
      return new Response(JSON.stringify({ sendDetail: { recipients, linkClicks, blocksJson, variants } }), { status: 200, headers: JSON_HEADERS })
    }

    const [subscribers, sends] = await Promise.all([
      getAllSubscribersEnriched(SITE_ID),
      getNewsletterSendsWithStats(SITE_ID),
    ])

    let posts: PostRef[] = []
    if (includePosts) {
      const items = await getContentItems(SITE_ID)
      posts = items.map((item) => ({
        slug: item.slug,
        title: item.title,
        summary: item.summary || '',
        image: item.image,
        date: item.date || '',
      }))
    }

    const response: Record<string, unknown> = { subscribers, sends, posts }
    if (includeStats) {
      response.overallStats = await getOverallNewsletterStats(SITE_ID)
    }

    return new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS })
  } catch (err: unknown) {
    console.error('[admin/newsletter GET]', err)
    Sentry.captureException(err, { tags: { area: 'admin-newsletter', method: 'GET' } })
    return new Response(JSON.stringify({ error: 'Daten konnten nicht geladen werden.' }), { status: 500, headers: JSON_HEADERS })
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers: JSON_HEADERS })
  }

  try {
    const body = await request.json()
    const action = body.action

    switch (action) {
      case 'sto-bootstrap':
        return await actionStoBootstrap()
      case 'delete':
        return await actionDeleteSubscriber(body)
      case 'unsubscribe':
        return await actionUnsubscribeSubscriber(body)
      case 'sync-content':
        return await actionSyncContent()
      case 'cancel-scheduled':
        return await actionCancelScheduled(body)
      case 'test-send':
        return await actionTestSend(body, await getSiteConfig(SITE_ID))
      case 'retry-failed':
        return await actionRetryFailed(body, await getSiteConfig(SITE_ID))
      case 'send':
        return await actionSend(body, await getSiteConfig(SITE_ID))
      default:
        return new Response(JSON.stringify({ error: 'action=send und subject sind erforderlich.' }), { status: 400, headers: JSON_HEADERS })
    }
  } catch (err: unknown) {
    console.error('[admin/newsletter POST]', err)
    Sentry.captureException(err, { tags: { area: 'admin-newsletter', method: 'POST' } })
    return new Response(JSON.stringify({ error: 'Newsletter konnte nicht versendet werden.' }), { status: 500, headers: JSON_HEADERS })
  }
}
