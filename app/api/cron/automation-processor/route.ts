import {
  getPendingSends,
  recordAutomationSend,
  isEnrollmentComplete,
  markEnrollmentCompleted,
} from '@/lib/automation'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getSubscriberByEmail } from '@/lib/newsletter'
import { getContentItemsBySlugs } from '@/lib/content'
import { getSiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const pending = await getPendingSends()
  if (pending.length === 0) {
    return Response.json({ processed: 0, message: 'No pending sends' })
  }

  // Group by enrollment, take only the first (lowest step_order) per enrollment
  const byEnrollment = new Map<number, (typeof pending)[0]>()
  for (const p of pending) {
    if (!byEnrollment.has(p.enrollment_id)) {
      byEnrollment.set(p.enrollment_id, p)
    }
  }
  const toSend = Array.from(byEnrollment.values())

  // Collect all slugs needed across all sends, grouped by site
  const slugsBySite = new Map<string, Set<string>>()
  for (const item of toSend) {
    const blocks: NewsletterBlock[] = JSON.parse(item.blocks_json)
    const siteSet = slugsBySite.get(item.site_id) || new Set<string>()
    for (const block of blocks) {
      if (block.type === 'hero') siteSet.add(block.slug)
      if (block.type === 'link-list') block.slugs.forEach((s) => siteSet.add(s))
    }
    slugsBySite.set(item.site_id, siteSet)
  }

  // Resolve posts per site
  const postsMapBySite = new Map<string, Record<string, PostRef>>()
  for (const [siteId, slugs] of slugsBySite) {
    const map = await getContentItemsBySlugs(siteId, [...slugs])
    postsMapBySite.set(siteId, map)
  }

  // Cache site configs
  const siteConfigs = new Map<string, Awaited<ReturnType<typeof getSiteConfig>>>()

  const results: { email: string; step: number; status: string }[] = []

  for (const item of toSend) {
    try {
      let site = siteConfigs.get(item.site_id)
      if (!site) {
        site = await getSiteConfig(item.site_id)
        siteConfigs.set(item.site_id, site)
      }

      const subscriber = await getSubscriberByEmail(item.site_id, item.subscriber_email)
      if (!subscriber) {
        results.push({ email: item.subscriber_email, step: item.step_order, status: 'skipped_no_subscriber' })
        continue
      }

      const blocks: NewsletterBlock[] = JSON.parse(item.blocks_json)
      const postsMap = postsMapBySite.get(item.site_id) || {}

      const { resendEmailId } = await sendMultiBlockNewsletterEmail(site, {
        email: item.subscriber_email,
        unsubscribeToken: subscriber.token,
        subject: item.subject,
        blocks,
        postsMap,
      })

      await recordAutomationSend(item.enrollment_id, item.step_id, resendEmailId)

      const complete = await isEnrollmentComplete(item.enrollment_id, item.automation_id)
      if (complete) {
        await markEnrollmentCompleted(item.enrollment_id)
      }

      results.push({ email: item.subscriber_email, step: item.step_order, status: 'sent' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[cron/automation] Failed to send to ${item.subscriber_email}:`, err)
      results.push({ email: item.subscriber_email, step: item.step_order, status: `error: ${message}` })
    }
  }

  return Response.json({ processed: results.length, results })
}
