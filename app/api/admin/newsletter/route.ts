import { isAuthenticated } from '@/lib/admin-auth'
import {
  getAllSubscribersEnriched,
  getConfirmedSubscribers,
  getSubscribersByTagSignal,
  getNewsletterSendsWithStats,
  recordNewsletterSend,
  recordNewsletterRecipientsBatch,
  getRecipientsForSend,
  getFailedRecipientsForSend,
  updateRecipientResendId,
  getSendForRetry,
  getLinkClicksForSend,
  getSendBlocksJson,
  getOverallNewsletterStats,
  getBounceOverview,
  deleteSubscriber,
  unsubscribeById,
  cancelNewsletterSend,
} from '@/lib/newsletter'
import { sendNewsletterEmail, sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getContentItems, getContentItemsBySlugs } from '@/lib/content'
import { getSiteConfig } from '@/lib/site-config'
import {
  enqueueScheduledSends,
  enqueueUniformSchedule,
  cancelScheduledSend,
  pushDueSendsToResend,
} from '@/lib/scheduled-sends'
import { getList, getListEmailsForSend } from '@/lib/lists'
import { bootstrapProfilesFromClicks } from '@/lib/send-time-optimization'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'

const SITE_ID = 'kokomo' // TODO: from session/query param when multi-site
const SEND_DELAY_MS = 800
const MAX_RETRIES = 2

export async function GET(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  try {
    const url = new URL(request.url)
    const includePosts = url.searchParams.get('posts') === '1'
    const includeStats = url.searchParams.get('stats') === '1'
    const sendDetailId = url.searchParams.get('sendDetail')
    const wantsBounces = url.searchParams.get('bounces') === '1'

    if (wantsBounces) {
      const overview = await getBounceOverview(SITE_ID)
      return new Response(JSON.stringify({ bounceOverview: overview }), { status: 200, headers })
    }

    if (sendDetailId) {
      const id = parseInt(sendDetailId, 10)
      if (isNaN(id)) {
        return new Response(JSON.stringify({ error: 'Ungültige sendDetail ID.' }), { status: 400, headers })
      }
      const [recipients, linkClicks, blocksJson] = await Promise.all([
        getRecipientsForSend(SITE_ID, id),
        getLinkClicksForSend(id),
        getSendBlocksJson(id),
      ])
      return new Response(JSON.stringify({ sendDetail: { recipients, linkClicks, blocksJson } }), { status: 200, headers })
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

    return new Response(JSON.stringify(response), { status: 200, headers })
  } catch (err: unknown) {
    console.error('[admin/newsletter GET]', err)
    return new Response(JSON.stringify({ error: 'Daten konnten nicht geladen werden.' }), { status: 500, headers })
  }
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  try {
    const body = await request.json()
    const {
      action, subject, subscriberId, blocks, testEmail,
      sendId: retrySendId, useSto, audienceFilter, scheduledFor, listId,
    } = body
    const site = await getSiteConfig(SITE_ID)

    // ─── STO Bootstrap (admin-trigger) ───
    if (action === 'sto-bootstrap') {
      const result = await bootstrapProfilesFromClicks(SITE_ID)
      return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers })
    }

    // ─── Test send ───
    if (action === 'test-send') {
      if (!subject || !blocks || !Array.isArray(blocks) || blocks.length === 0) {
        return new Response(JSON.stringify({ error: 'subject und blocks sind erforderlich.' }), { status: 400, headers })
      }
      if (!testEmail || typeof testEmail !== 'string') {
        return new Response(JSON.stringify({ error: 'testEmail ist erforderlich.' }), { status: 400, headers })
      }

      const typedBlocks = blocks as NewsletterBlock[]
      const slugs = collectSlugs(typedBlocks)
      const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

      await sendMultiBlockNewsletterEmail(site, {
        email: testEmail,
        unsubscribeToken: 'test',
        subject: `[TEST] ${subject}`,
        blocks: typedBlocks,
        postsMap,
      })

      return new Response(JSON.stringify({ ok: true, sent: 1, testEmail }), { status: 200, headers })
    }

    // ─── Retry failed recipients ───
    if (action === 'retry-failed') {
      if (!retrySendId) {
        return new Response(JSON.stringify({ error: 'sendId ist erforderlich.' }), { status: 400, headers })
      }

      const sendData = await getSendForRetry(retrySendId)
      if (!sendData) {
        return new Response(JSON.stringify({ error: 'Keine Blocks für diesen Versand gespeichert.' }), { status: 400, headers })
      }

      const failedRecipients = await getFailedRecipientsForSend(SITE_ID, retrySendId)
      if (failedRecipients.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Keine fehlgeschlagenen Empfänger gefunden.' }), { status: 200, headers })
      }

      const typedBlocks = JSON.parse(sendData.blocks_json) as NewsletterBlock[]
      const slugs = collectSlugs(typedBlocks)
      const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

      return streamSend(failedRecipients, site, sendData.subject, typedBlocks, postsMap, retrySendId)
    }

    // ─── Delete subscriber ───
    if (action === 'delete') {
      if (!subscriberId || typeof subscriberId !== 'number') {
        return new Response(JSON.stringify({ error: 'Ungültige subscriberId.' }), { status: 400, headers })
      }
      await deleteSubscriber(subscriberId)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    }

    // ─── Unsubscribe (Status setzen, nicht löschen) ───
    if (action === 'unsubscribe') {
      if (!subscriberId || typeof subscriberId !== 'number') {
        return new Response(JSON.stringify({ error: 'Ungültige subscriberId.' }), { status: 400, headers })
      }
      await unsubscribeById(subscriberId)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    }

    // ─── Sync content from kokomo.house ───
    if (action === 'sync-content') {
      const sourceUrl = process.env.CONTENT_SYNC_SOURCE_URL || 'https://www.kokomo.house/api/sync-newsletter-content'
      const cronSecret = process.env.CRON_SECRET

      try {
        // Call kokomo.house API which fetches all posts and pushes them to our content-sync endpoint
        const res = await fetch(sourceUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
          },
        })

        if (!res.ok) {
          const body = await res.text()
          return new Response(JSON.stringify({ error: `Sync fehlgeschlagen (${res.status}): ${body}` }), { status: 502, headers })
        }

        const result = await res.json()
        return new Response(JSON.stringify({ ok: true, synced: result.synced ?? result.total_posts ?? 0 }), { status: 200, headers })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
        return new Response(JSON.stringify({ error: `Sync fehlgeschlagen: ${msg}` }), { status: 500, headers })
      }
    }

    // ─── Cancel a scheduled send ───
    if (action === 'cancel-scheduled') {
      const id = typeof retrySendId === 'number' ? retrySendId : parseInt(String(retrySendId), 10)
      if (!id || Number.isNaN(id)) {
        return new Response(JSON.stringify({ error: 'sendId ist erforderlich.' }), { status: 400, headers })
      }
      const result = await cancelScheduledSend(id)
      await cancelNewsletterSend(id)
      return new Response(JSON.stringify({
        ok: true,
        cancelled_pending: result.cancelled_pending,
        cancelled_pushed: result.cancelled_pushed,
        failed_pushed: result.failed_pushed,
      }), { status: 200, headers })
    }

    // ─── Send newsletter ───
    if (action !== 'send' || !subject) {
      return new Response(JSON.stringify({ error: 'action=send und subject sind erforderlich.' }), { status: 400, headers })
    }

    const parsedFilter = parseAudienceFilter(audienceFilter)
    const parsedListId = typeof listId === 'number' && Number.isFinite(listId) ? listId : null

    let subscribers: { email: string; token: string }[]
    let audienceLabel: 'list' | 'segment' | 'all'

    if (parsedListId !== null) {
      const list = await getList(parsedListId)
      if (!list || list.site_id !== SITE_ID) {
        return new Response(JSON.stringify({ error: 'Liste nicht gefunden.' }), { status: 404, headers })
      }
      subscribers = await getListEmailsForSend(parsedListId)
      audienceLabel = 'list'
      if (subscribers.length === 0) {
        return new Response(JSON.stringify({ error: 'Liste hat keine Mitglieder.' }), { status: 400, headers })
      }
    } else if (parsedFilter) {
      subscribers = await getSubscribersByTagSignal(SITE_ID, parsedFilter.tags, parsedFilter.minSignal)
      audienceLabel = 'segment'
      if (subscribers.length === 0) {
        return new Response(JSON.stringify({ error: 'Keine Abonnenten matchen das gewählte Segment.' }), { status: 400, headers })
      }
    } else {
      subscribers = await getConfirmedSubscribers(SITE_ID)
      audienceLabel = 'all'
      if (subscribers.length === 0) {
        return new Response(JSON.stringify({ error: 'Keine bestätigten Abonnenten vorhanden.' }), { status: 400, headers })
      }
    }
    void audienceLabel // reserved for future analytics

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return new Response(JSON.stringify({ error: 'blocks sind erforderlich.' }), { status: 400, headers })
    }

    const typedBlocks = blocks as NewsletterBlock[]
    const slugs = collectSlugs(typedBlocks)
    const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

    const firstSlug = slugs.size > 0 ? [...slugs][0] : 'multi-block'
    const firstPost = postsMap[firstSlug]

    // ─── Geplanter Versand (fixe Zeit oder STO ab geplantem Zeitpunkt) ───
    const scheduledForDate = parseScheduledFor(scheduledFor)
    if (scheduledForDate) {
      const scheduledIso = scheduledForDate.toISOString()
      const sendId = await recordNewsletterSend(SITE_ID, {
        post_slug: firstSlug,
        post_title: firstPost?.title ?? subject,
        subject,
        recipient_count: subscribers.length,
        blocks_json: JSON.stringify(typedBlocks),
        scheduled_for: scheduledIso,
        status: 'scheduled',
      })
      await recordNewsletterRecipientsBatch(
        subscribers.map((s) => ({ send_id: sendId, email: s.email, resend_email_id: null })),
      )

      let enqueued: { enqueued: number; earliest?: string; latest?: string }
      if (useSto) {
        // STO ab geplantem Zeitpunkt: Empfänger mit Profil bekommen Mail zur
        // persönlichen Lieblingszeit nach scheduledForDate. Ohne Profil: genau scheduledIso.
        enqueued = await enqueueScheduledSends(SITE_ID, sendId, subscribers, scheduledForDate)
      } else {
        enqueued = await enqueueUniformSchedule(SITE_ID, sendId, subscribers, scheduledIso)
      }

      // Innerhalb des 1h-Push-Horizons: direkt an Resend übergeben statt auf Cron warten.
      const pushResult = await pushDueSendsToResend()
      return new Response(JSON.stringify({
        ok: true,
        mode: useSto ? 'scheduled+sto' : 'scheduled',
        sendId,
        scheduledFor: scheduledIso,
        enqueued: enqueued.enqueued,
        earliest: enqueued.earliest,
        latest: enqueued.latest,
        pushed_now: pushResult.pushed,
      }), { status: 200, headers })
    }

    const sendId = await recordNewsletterSend(SITE_ID, {
      post_slug: firstSlug,
      post_title: firstPost?.title ?? subject,
      subject,
      recipient_count: subscribers.length,
      blocks_json: JSON.stringify(typedBlocks),
    })

    await recordNewsletterRecipientsBatch(
      subscribers.map((s) => ({ send_id: sendId, email: s.email, resend_email_id: null })),
    )

    // ─── Send-Time Optimization: per-recipient Schedule statt Stream ───
    if (useSto) {
      const enqueued = await enqueueScheduledSends(SITE_ID, sendId, subscribers)
      const pushResult = await pushDueSendsToResend()
      return new Response(JSON.stringify({
        ok: true,
        mode: 'sto',
        sendId,
        enqueued: enqueued.enqueued,
        earliest: enqueued.earliest,
        latest: enqueued.latest,
        pushed_now: pushResult.pushed,
        failed: pushResult.failed,
      }), { status: 200, headers })
    }

    return streamSend(subscribers, site, subject, typedBlocks, postsMap, sendId)
  } catch (err: unknown) {
    console.error('[admin/newsletter POST]', err)
    return new Response(JSON.stringify({ error: 'Newsletter konnte nicht versendet werden.' }), { status: 500, headers })
  }
}

function collectSlugs(blocks: NewsletterBlock[]): Set<string> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') slugs.add(block.slug)
    if (block.type === 'link-list') block.slugs.forEach((s) => slugs.add(s))
  }
  return slugs
}

function parseScheduledFor(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string') return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  // Mindestens 1 Minute in der Zukunft, sonst direkt versenden.
  if (date.getTime() <= Date.now() + 60_000) return null
  return date
}

function parseAudienceFilter(raw: unknown): { tags: string[]; minSignal: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { tags?: unknown; minSignal?: unknown }
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : []
  const minSignal = typeof obj.minSignal === 'number' && Number.isFinite(obj.minSignal) ? Math.max(1, Math.floor(obj.minSignal)) : 0
  if (tags.length === 0 || minSignal < 1) return null
  return { tags, minSignal }
}

function streamSend(
  recipients: { email: string; token: string }[],
  site: Awaited<ReturnType<typeof getSiteConfig>>,
  subject: string,
  blocks: NewsletterBlock[],
  postsMap: Record<string, PostRef>,
  sendId: number,
) {
  let successCount = 0

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      for (let i = 0; i < recipients.length; i++) {
        const sub = recipients[i]
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const result = await sendMultiBlockNewsletterEmail(site, {
              email: sub.email,
              unsubscribeToken: sub.token,
              subject,
              blocks,
              postsMap,
              sendId,
            })
            successCount++
            await updateRecipientResendId(sendId, sub.email, result.resendEmailId ?? '')
            break
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : ''
            const statusCode = (err as { statusCode?: number }).statusCode
            const isRetryable =
              statusCode === 429 ||
              (typeof statusCode === 'number' && statusCode >= 500) ||
              message.includes('rate')
            if (isRetryable && attempt < MAX_RETRIES) {
              const baseMs = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
              const jitterMs = Math.floor(Math.random() * 500)
              await new Promise((resolve) => setTimeout(resolve, baseMs + jitterMs))
            } else {
              console.error(`[newsletter] Failed to send to ${sub.email}:`, message)
              break
            }
          }
        }

        controller.enqueue(encoder.encode(
          JSON.stringify({ sent: successCount, total: recipients.length, remaining: recipients.length - successCount }) + '\n',
        ))

        if (i < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS))
        }
      }

      controller.enqueue(encoder.encode(
        JSON.stringify({ done: true, sent: successCount, total: recipients.length }) + '\n',
      ))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' },
  })
}
