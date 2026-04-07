import { isAuthenticated } from '@/lib/admin-auth'
import {
  getAllSubscribers,
  getConfirmedSubscribers,
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
  deleteSubscriber,
} from '@/lib/newsletter'
import { sendNewsletterEmail, sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getContentItems, getContentItemsBySlugs } from '@/lib/content'
import { getSiteConfig } from '@/lib/site-config'
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

    if (sendDetailId) {
      const id = parseInt(sendDetailId, 10)
      if (isNaN(id)) {
        return new Response(JSON.stringify({ error: 'Ungültige sendDetail ID.' }), { status: 400, headers })
      }
      const [recipients, linkClicks, blocksJson] = await Promise.all([
        getRecipientsForSend(id),
        getLinkClicksForSend(id),
        getSendBlocksJson(id),
      ])
      return new Response(JSON.stringify({ sendDetail: { recipients, linkClicks, blocksJson } }), { status: 200, headers })
    }

    const [subscribers, sends] = await Promise.all([
      getAllSubscribers(SITE_ID),
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/newsletter GET]', err)
    return new Response(JSON.stringify({ error: 'Daten konnten nicht geladen werden.', detail: message }), { status: 500, headers })
  }
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  try {
    const body = await request.json()
    const { action, subject, subscriberId, blocks, testEmail, sendId: retrySendId } = body
    const site = await getSiteConfig(SITE_ID)

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

    // ─── Sync content ───
    if (action === 'sync-content') {
      const { readdir, readFile } = await import('fs/promises')
      const { join } = await import('path')
      const contentDir = process.env.KOKOMO_CONTENT_DIR || '/Users/michaelmauch/Documents/Development/kokomo2026/src/content/posts'

      let files: string[]
      try {
        files = await readdir(contentDir)
      } catch {
        return new Response(JSON.stringify({ error: `Content-Verzeichnis nicht gefunden: ${contentDir}` }), { status: 500, headers })
      }

      const mdFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
      let synced = 0

      for (const file of mdFiles) {
        const content = await readFile(join(contentDir, file), 'utf-8')
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
        if (!fmMatch) continue

        const yaml = fmMatch[1]
        const fm: Record<string, string | boolean> = {}
        for (const line of yaml.split('\n')) {
          const colonIdx = line.indexOf(':')
          if (colonIdx === -1) continue
          const key = line.slice(0, colonIdx).trim()
          let val = line.slice(colonIdx + 1).trim()
          if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1)
          fm[key] = val === 'true' ? true : val === 'false' ? false : val
        }

        if (!fm.title || fm.draft === true) continue

        const slug = file.replace(/\.(md|mdx)$/, '')
        const image = typeof fm.images === 'string' ? fm.images : null

        await getContentItemsBySlugs(SITE_ID, [slug]) // ensure import is used
        const { upsertContentItems } = await import('@/lib/content')
        await upsertContentItems(SITE_ID, [{
          slug,
          title: fm.title as string,
          summary: (fm.summary as string) || undefined,
          image: image || undefined,
          date: (fm.date as string) || undefined,
          published: true,
        }])
        synced++
      }

      return new Response(JSON.stringify({ ok: true, synced }), { status: 200, headers })
    }

    // ─── Send newsletter ───
    if (action !== 'send' || !subject) {
      return new Response(JSON.stringify({ error: 'action=send und subject sind erforderlich.' }), { status: 400, headers })
    }

    const subscribers = await getConfirmedSubscribers(SITE_ID)
    if (subscribers.length === 0) {
      return new Response(JSON.stringify({ error: 'Keine bestätigten Abonnenten vorhanden.' }), { status: 400, headers })
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return new Response(JSON.stringify({ error: 'blocks sind erforderlich.' }), { status: 400, headers })
    }

    const typedBlocks = blocks as NewsletterBlock[]
    const slugs = collectSlugs(typedBlocks)
    const postsMap = await getContentItemsBySlugs(SITE_ID, [...slugs])

    const firstSlug = slugs.size > 0 ? [...slugs][0] : 'multi-block'
    const firstPost = postsMap[firstSlug]
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

    return streamSend(subscribers, site, subject, typedBlocks, postsMap, sendId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/newsletter POST]', err)
    return new Response(JSON.stringify({ error: 'Newsletter konnte nicht versendet werden.', detail: message }), { status: 500, headers })
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
            })
            successCount++
            await updateRecipientResendId(sendId, sub.email, result.resendEmailId ?? '')
            break
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : ''
            const statusCode = (err as { statusCode?: number }).statusCode
            const isRateLimit = statusCode === 429 || message.includes('rate')
            if (isRateLimit && attempt < MAX_RETRIES) {
              await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)))
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
