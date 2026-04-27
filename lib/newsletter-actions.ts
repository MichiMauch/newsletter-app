/**
 * Newsletter POST action handlers — extracted from app/api/admin/newsletter/route.ts.
 * Each function returns a `Response` and assumes the caller has authenticated
 * the request and parsed the body.
 */

import {
  getConfirmedSubscribers,
  getSubscribersByTagSignal,
  recordNewsletterSend,
  recordNewsletterRecipientsBatch,
  recordSendVariants,
  assignVariants,
  parseVariantsInput,
  getFailedRecipientsForSend,
  updateRecipientResendId,
  getSendForRetry,
  deleteSubscriber,
  unsubscribeById,
  cancelNewsletterSend,
  type VariantSpec,
} from '@/lib/newsletter'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getContentItemsBySlugs } from '@/lib/content'
import type { SiteConfig } from '@/lib/site-config'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import {
  enqueueScheduledSends,
  enqueueUniformSchedule,
  cancelScheduledSend,
  pushDueSendsToResend,
} from '@/lib/scheduled-sends'
import { getList, getListEmailsForSend } from '@/lib/lists'
import { bootstrapProfilesFromClicks } from '@/lib/send-time-optimization'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import { isValidEmail } from '@/lib/validators'

const SEND_DELAY_MS = 800
const MAX_RETRIES = 2
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

interface NewsletterActionBody {
  action?: string
  subject?: string
  preheader?: string
  subscriberId?: number
  blocks?: NewsletterBlock[]
  testEmail?: string
  sendId?: number
  useSto?: boolean
  audienceFilter?: unknown
  scheduledFor?: string
  listId?: number
  variants?: unknown
}

const PREHEADER_MAX = 200

function sanitizePreheader(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, PREHEADER_MAX)
}

function jsonOk(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS })
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS })
}

export function collectSlugs(blocks: NewsletterBlock[]): Set<string> {
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

interface StreamRecipient {
  email: string
  token: string
  subject: string
  variantLabel?: string
}

function streamSend(
  recipients: StreamRecipient[],
  site: SiteConfig,
  preheader: string | null,
  blocks: NewsletterBlock[],
  postsMap: Record<string, PostRef>,
  sendId: number,
): Response {
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
              subject: sub.subject,
              preheader,
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

// ─── Action handlers ──────────────────────────────────────────────────

export async function actionStoBootstrap(): Promise<Response> {
  const result = await bootstrapProfilesFromClicks(SITE_ID)
  return jsonOk({ ok: true, ...result })
}

export async function actionTestSend(body: NewsletterActionBody, site: SiteConfig): Promise<Response> {
  const { subject, blocks, testEmail } = body
  const preheader = sanitizePreheader(body.preheader)
  if (!subject || !blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return jsonError('subject und blocks sind erforderlich.', 400)
  }
  if (!isValidEmail(testEmail)) {
    return jsonError('Ungültige Test-E-Mail-Adresse.', 400)
  }
  const recipient = testEmail.trim().toLowerCase()

  const slugs = collectSlugs(blocks)
  const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

  await sendMultiBlockNewsletterEmail(site, {
    email: recipient,
    unsubscribeToken: 'test',
    subject: `[TEST] ${subject}`,
    preheader,
    blocks,
    postsMap,
  })

  return jsonOk({ ok: true, sent: 1, testEmail: recipient })
}

export async function actionRetryFailed(body: NewsletterActionBody, site: SiteConfig): Promise<Response> {
  const { sendId: retrySendId } = body
  if (!retrySendId) {
    return jsonError('sendId ist erforderlich.', 400)
  }

  const sendData = await getSendForRetry(retrySendId)
  if (!sendData) {
    return jsonError('Keine Blocks für diesen Versand gespeichert.', 400)
  }

  const failedRecipients = await getFailedRecipientsForSend(SITE_ID, retrySendId)
  if (failedRecipients.length === 0) {
    return jsonOk({ ok: true, sent: 0, message: 'Keine fehlgeschlagenen Empfänger gefunden.' })
  }

  const typedBlocks = JSON.parse(sendData.blocks_json) as NewsletterBlock[]
  const slugs = collectSlugs(typedBlocks)
  const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

  // Retries reuse the original send's subject for every failed recipient.
  // Variant-tracked sends keep their original variant_label on the recipient
  // row, so per-variant counters still bump correctly when the retry lands.
  const retryRecipients: StreamRecipient[] = failedRecipients.map((r) => ({
    email: r.email,
    token: r.token,
    subject: sendData.subject,
  }))
  return streamSend(retryRecipients, site, sendData.preheader, typedBlocks, postsMap, retrySendId)
}

export async function actionDeleteSubscriber(body: NewsletterActionBody): Promise<Response> {
  const { subscriberId } = body
  if (!subscriberId || typeof subscriberId !== 'number') {
    return jsonError('Ungültige subscriberId.', 400)
  }
  await deleteSubscriber(subscriberId)
  return jsonOk({ ok: true })
}

export async function actionUnsubscribeSubscriber(body: NewsletterActionBody): Promise<Response> {
  const { subscriberId } = body
  if (!subscriberId || typeof subscriberId !== 'number') {
    return jsonError('Ungültige subscriberId.', 400)
  }
  await unsubscribeById(subscriberId)
  return jsonOk({ ok: true })
}

export async function actionSyncContent(): Promise<Response> {
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
      const responseBody = await res.text()
      return jsonError(`Sync fehlgeschlagen (${res.status}): ${responseBody}`, 502)
    }

    const result = await res.json()
    return jsonOk({ ok: true, synced: result.synced ?? result.total_posts ?? 0 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return jsonError(`Sync fehlgeschlagen: ${msg}`, 500)
  }
}

export async function actionCancelScheduled(body: NewsletterActionBody): Promise<Response> {
  const raw = body.sendId
  const id = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (!id || Number.isNaN(id)) {
    return jsonError('sendId ist erforderlich.', 400)
  }
  const result = await cancelScheduledSend(id)
  await cancelNewsletterSend(id)
  return jsonOk({
    ok: true,
    cancelled_pending: result.cancelled_pending,
    cancelled_pushed: result.cancelled_pushed,
    failed_pushed: result.failed_pushed,
  })
}

export async function actionSend(body: NewsletterActionBody, site: SiteConfig): Promise<Response> {
  const { subject, blocks, useSto, audienceFilter, scheduledFor, listId } = body
  const preheader = sanitizePreheader(body.preheader)
  const variants: VariantSpec[] | null = body.variants !== undefined ? parseVariantsInput(body.variants) : null

  if (body.variants !== undefined && variants === null) {
    return jsonError('Ungültige A/B-Varianten (2-5 Einträge mit "label" und "subject").', 400)
  }

  if (variants && (useSto || scheduledFor)) {
    return jsonError('A/B-Test mit Send-Time-Optimization oder geplantem Versand ist (noch) nicht unterstützt.', 400)
  }

  if (!subject && !variants) {
    return jsonError('action=send und subject sind erforderlich.', 400)
  }

  const parsedFilter = parseAudienceFilter(audienceFilter)
  const parsedListId = typeof listId === 'number' && Number.isFinite(listId) ? listId : null

  let subscribers: { email: string; token: string }[]

  if (parsedListId !== null) {
    const list = await getList(parsedListId)
    if (!list || list.site_id !== SITE_ID) {
      return jsonError('Liste nicht gefunden.', 404)
    }
    subscribers = await getListEmailsForSend(parsedListId)
    if (subscribers.length === 0) {
      return jsonError('Liste hat keine Mitglieder.', 400)
    }
  } else if (parsedFilter) {
    subscribers = await getSubscribersByTagSignal(SITE_ID, parsedFilter.tags, parsedFilter.minSignal)
    if (subscribers.length === 0) {
      return jsonError('Keine Abonnenten matchen das gewählte Segment.', 400)
    }
  } else {
    subscribers = await getConfirmedSubscribers(SITE_ID)
    if (subscribers.length === 0) {
      return jsonError('Keine bestätigten Abonnenten vorhanden.', 400)
    }
  }

  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return jsonError('blocks sind erforderlich.', 400)
  }

  const slugs = collectSlugs(blocks)
  const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

  const firstSlug = slugs.size > 0 ? [...slugs][0] : 'multi-block'
  const firstPost = postsMap[firstSlug]

  // ─── Geplanter Versand (fixe Zeit oder STO ab geplantem Zeitpunkt) ───
  // variants are rejected above when scheduled, so `subject` is guaranteed here.
  const scheduledForDate = parseScheduledFor(scheduledFor)
  if (scheduledForDate) {
    if (!subject) {
      return jsonError('subject ist für geplanten Versand erforderlich.', 400)
    }
    const scheduledIso = scheduledForDate.toISOString()
    const sendId = await recordNewsletterSend(SITE_ID, {
      post_slug: firstSlug,
      post_title: firstPost?.title ?? subject,
      subject,
      preheader,
      recipient_count: subscribers.length,
      blocks_json: JSON.stringify(blocks),
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
    return jsonOk({
      ok: true,
      mode: useSto ? 'scheduled+sto' : 'scheduled',
      sendId,
      scheduledFor: scheduledIso,
      enqueued: enqueued.enqueued,
      earliest: enqueued.earliest,
      latest: enqueued.latest,
      pushed_now: pushResult.pushed,
    })
  }

  // For variant sends the parent send.subject is informational ("A/B: A | B"),
  // the actual per-recipient subject comes from the variants table.
  const parentSubject = variants
    ? `A/B: ${variants.map((v) => v.label).join(' | ')}`
    : subject!
  const sendId = await recordNewsletterSend(SITE_ID, {
    post_slug: firstSlug,
    post_title: firstPost?.title ?? parentSubject,
    subject: parentSubject,
    preheader,
    recipient_count: subscribers.length,
    blocks_json: JSON.stringify(blocks),
  })

  if (variants) {
    const assigned = assignVariants(subscribers, variants)
    const counts = new Map<string, number>()
    for (const a of assigned) counts.set(a.variant.label, (counts.get(a.variant.label) ?? 0) + 1)
    await recordSendVariants(
      sendId,
      variants.map((v) => ({ ...v, recipient_count: counts.get(v.label) ?? 0 })),
    )
    await recordNewsletterRecipientsBatch(
      assigned.map((a) => ({
        send_id: sendId,
        email: a.email,
        resend_email_id: null,
        variant_label: a.variant.label,
      })),
    )
  } else {
    await recordNewsletterRecipientsBatch(
      subscribers.map((s) => ({ send_id: sendId, email: s.email, resend_email_id: null })),
    )
  }

  // ─── Send-Time Optimization: per-recipient Schedule statt Stream ───
  if (useSto) {
    const enqueued = await enqueueScheduledSends(SITE_ID, sendId, subscribers)
    const pushResult = await pushDueSendsToResend()
    return jsonOk({
      ok: true,
      mode: 'sto',
      sendId,
      enqueued: enqueued.enqueued,
      earliest: enqueued.earliest,
      latest: enqueued.latest,
      pushed_now: pushResult.pushed,
      failed: pushResult.failed,
    })
  }

  const streamRecipients: StreamRecipient[] = variants
    ? assignVariants(subscribers, variants).map((a) => ({
        email: a.email,
        token: a.token,
        subject: a.variant.subject,
        variantLabel: a.variant.label,
      }))
    : subscribers.map((s) => ({ email: s.email, token: s.token, subject: subject! }))

  return streamSend(streamRecipients, site, preheader, blocks, postsMap, sendId)
}
