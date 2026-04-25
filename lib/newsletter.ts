/**
 * Newsletter data layer — Drizzle ORM
 * Manages subscribers and send history — multi-site aware via site_id
 */

import { eq, and, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterSubscribers,
  newsletterSends,
  newsletterRecipients,
  newsletterLinkClicks,
  subscriberTagSignals,
} from './schema'

// ─── Types ─────────────────────────────────────────────────────────────

export type Subscriber = typeof newsletterSubscribers.$inferSelect

export interface NewsletterSend {
  id: number
  site_id: string
  post_slug: string
  post_title: string
  subject: string
  sent_at: string
  recipient_count: number
  status: string
}

export type NewsletterRecipient = typeof newsletterRecipients.$inferSelect

export interface NewsletterSendStats extends NewsletterSend {
  delivered_count: number
  clicked_count: number
  bounced_count: number
  complained_count: number
}

export interface LinkClickStats {
  url: string
  click_count: number
  unique_clickers: number
}

export interface OverallStats {
  total_sends: number
  total_recipients: number
  avg_click_rate: number
  avg_bounce_rate: number
  total_complaints: number
}

export interface SendTrend {
  id: number
  subject: string
  sent_at: string
  recipient_count: number
  click_rate: number
  bounce_rate: number
}

export interface SubscriberGrowth {
  month: string
  total: number
  new_count: number
}

// ─── Subscriber CRUD ───────────────────────────────────────────────────

export async function createSubscriber(siteId: string, email: string): Promise<{ token: string; alreadyConfirmed: boolean }> {
  const db = getDb()
  const token = crypto.randomUUID()

  const existing = await db.select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
    .limit(1)

  if (existing.length > 0) {
    const { status } = existing[0]

    if (status === 'confirmed') {
      return { token: '', alreadyConfirmed: true }
    }

    if (status === 'unsubscribed') {
      await db.update(newsletterSubscribers)
        .set({ status: 'pending', token, unsubscribedAt: null })
        .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
      return { token, alreadyConfirmed: false }
    }

    // Status is pending — regenerate token
    await db.update(newsletterSubscribers)
      .set({ token })
      .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
    return { token, alreadyConfirmed: false }
  }

  await db.insert(newsletterSubscribers).values({ siteId, email, status: 'pending', token })
  return { token, alreadyConfirmed: false }
}

export async function confirmSubscriber(token: string): Promise<boolean> {
  const db = getDb()
  const result = await db.update(newsletterSubscribers)
    .set({ status: 'confirmed', confirmedAt: sql`datetime('now')` })
    .where(and(eq(newsletterSubscribers.token, token), eq(newsletterSubscribers.status, 'pending')))
  return (result.rowsAffected ?? 0) > 0
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const db = getDb()
  const result = await db.run(sql`
    UPDATE newsletter_subscribers
    SET status = 'unsubscribed', unsubscribed_at = datetime('now')
    WHERE token = ${token} AND status != 'unsubscribed'
  `)
  return (result.rowsAffected ?? 0) > 0
}

export async function getAllSubscribers(siteId: string): Promise<Subscriber[]> {
  const db = getDb()
  return db.select().from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.siteId, siteId))
    .orderBy(sql`${newsletterSubscribers.createdAt} DESC`)
}

export interface SubscriberEnriched extends Subscriber {
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags: string[]
}

export async function getAllSubscribersEnriched(siteId: string): Promise<SubscriberEnriched[]> {
  const db = getDb()
  // Eine Query: Subscribers + Engagement (LEFT JOIN) + Tags (GROUP_CONCAT)
  const rows = await db.run(sql`
    SELECT
      s.id, s.site_id, s.email, s.status, s.token, s.created_at, s.confirmed_at, s.unsubscribed_at,
      se.score AS engagement_score, se.tier AS engagement_tier,
      (
        SELECT GROUP_CONCAT(t.tag, '||')
        FROM subscriber_tags t
        WHERE t.site_id = s.site_id AND t.subscriber_email = s.email
      ) AS tags_concat
    FROM newsletter_subscribers s
    LEFT JOIN subscriber_engagement se
      ON se.site_id = s.site_id AND se.subscriber_email = s.email
    WHERE s.site_id = ${siteId}
    ORDER BY s.created_at DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    siteId: r.site_id as string,
    email: r.email as string,
    status: r.status as Subscriber['status'],
    token: r.token as string,
    createdAt: r.created_at as string,
    confirmedAt: (r.confirmed_at as string | null) ?? null,
    unsubscribedAt: (r.unsubscribed_at as string | null) ?? null,
    engagement_score: (r.engagement_score as number | null) ?? null,
    engagement_tier: (r.engagement_tier as SubscriberEnriched['engagement_tier']) ?? null,
    tags: r.tags_concat ? (r.tags_concat as string).split('||') : [],
  }))
}

export async function unsubscribeById(id: number): Promise<void> {
  const db = getDb()
  await db.update(newsletterSubscribers)
    .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
    .where(eq(newsletterSubscribers.id, id))
}

export async function getSubscriberByToken(token: string): Promise<{ email: string; token: string; site_id: string } | null> {
  const db = getDb()
  const rows = await db.select({
    email: newsletterSubscribers.email,
    token: newsletterSubscribers.token,
    site_id: newsletterSubscribers.siteId,
  }).from(newsletterSubscribers).where(eq(newsletterSubscribers.token, token)).limit(1)
  return rows[0] ?? null
}

export async function getSubscriberByEmail(siteId: string, email: string): Promise<{ email: string; token: string } | null> {
  const db = getDb()
  const rows = await db.select({ email: newsletterSubscribers.email, token: newsletterSubscribers.token })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email), eq(newsletterSubscribers.status, 'confirmed')))
    .limit(1)
  return rows[0] ?? null
}

export async function getConfirmedSubscribers(siteId: string): Promise<{ email: string; token: string }[]> {
  const db = getDb()
  return db.select({ email: newsletterSubscribers.email, token: newsletterSubscribers.token })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.status, 'confirmed')))
}

export async function getSubscribersByTagSignal(
  siteId: string,
  tags: string[],
  minSignal: number,
): Promise<{ email: string; token: string }[]> {
  if (tags.length === 0 || minSignal < 1) return []
  const db = getDb()
  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      token: newsletterSubscribers.token,
    })
    .from(newsletterSubscribers)
    .innerJoin(
      subscriberTagSignals,
      and(
        eq(subscriberTagSignals.siteId, newsletterSubscribers.siteId),
        eq(subscriberTagSignals.subscriberEmail, newsletterSubscribers.email),
      ),
    )
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      eq(newsletterSubscribers.status, 'confirmed'),
      inArray(subscriberTagSignals.tag, tags),
    ))
    .groupBy(newsletterSubscribers.email, newsletterSubscribers.token)
    .having(sql`SUM(${subscriberTagSignals.clickCount}) >= ${minSignal}`)

  return rows
}

export async function deleteSubscriber(id: number): Promise<void> {
  const db = getDb()
  await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, id))
}

// ─── Send History ──────────────────────────────────────────────────────

export async function recordNewsletterSend(siteId: string, data: {
  post_slug: string; post_title: string; subject: string; recipient_count: number; blocks_json?: string
}): Promise<number> {
  const db = getDb()
  const result = await db.insert(newsletterSends).values({
    siteId,
    postSlug: data.post_slug,
    postTitle: data.post_title,
    subject: data.subject,
    recipientCount: data.recipient_count,
    blocksJson: data.blocks_json ?? null,
  }).returning({ id: newsletterSends.id })
  return result[0].id
}

export async function getLastSendWithBlocks(siteId: string): Promise<{ subject: string; blocks_json: string; post_slug: string } | null> {
  const db = getDb()
  const rows = await db.select({
    subject: newsletterSends.subject,
    blocks_json: newsletterSends.blocksJson,
    post_slug: newsletterSends.postSlug,
  }).from(newsletterSends)
    .where(and(eq(newsletterSends.siteId, siteId), eq(newsletterSends.status, 'sent')))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
    .limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, blocks_json: row.blocks_json, post_slug: row.post_slug }
}

export async function getSendForRetry(sendId: number): Promise<{ subject: string; blocks_json: string } | null> {
  const db = getDb()
  const rows = await db.select({ subject: newsletterSends.subject, blocks_json: newsletterSends.blocksJson })
    .from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, blocks_json: row.blocks_json }
}

export async function getNewsletterSends(siteId: string): Promise<NewsletterSend[]> {
  const db = getDb()
  const rows = await db.select().from(newsletterSends)
    .where(eq(newsletterSends.siteId, siteId))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, sent_at: r.sentAt, recipient_count: r.recipientCount, status: r.status,
  }))
}

// ─── Recipient Tracking ─────────────────────────────────────────────

export async function recordNewsletterRecipientsBatch(
  recipients: { send_id: number; email: string; resend_email_id: string | null }[],
): Promise<void> {
  if (recipients.length === 0) return
  const db = getDb()
  const CHUNK_SIZE = 50
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    await db.insert(newsletterRecipients).values(
      chunk.map((r) => ({ sendId: r.send_id, email: r.email, resendEmailId: r.resend_email_id })),
    )
  }
}

export async function updateRecipientEvent(
  resendEmailId: string,
  event: 'delivered' | 'clicked' | 'bounced' | 'complained',
  timestamp: string,
  metadata?: { bounce_type?: string; click_url?: string },
): Promise<void> {
  const db = getDb()

  const existing = await db.select({
    id: newsletterRecipients.id, sendId: newsletterRecipients.sendId,
    email: newsletterRecipients.email, status: newsletterRecipients.status,
    clickCount: newsletterRecipients.clickCount,
  }).from(newsletterRecipients).where(eq(newsletterRecipients.resendEmailId, resendEmailId)).limit(1)

  if (existing.length === 0) return

  const recipient = existing[0]
  if (recipient.status === 'bounced' || recipient.status === 'complained') return

  switch (event) {
    case 'delivered': {
      const isFirst = recipient.status === 'sent'
      await db.run(sql`
        UPDATE newsletter_recipients
        SET status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
            delivered_at = COALESCE(delivered_at, ${timestamp})
        WHERE id = ${recipient.id}
      `)
      if (isFirst) {
        await db.update(newsletterSends)
          .set({ deliveredCount: sql`${newsletterSends.deliveredCount} + 1` })
          .where(eq(newsletterSends.id, recipient.sendId))
      }
      break
    }
    case 'clicked': {
      const isFirstClick = recipient.clickCount === 0
      await db.update(newsletterRecipients)
        .set({ status: 'clicked', clickedAt: sql`COALESCE(${newsletterRecipients.clickedAt}, ${timestamp})`, clickCount: sql`${newsletterRecipients.clickCount} + 1` })
        .where(eq(newsletterRecipients.id, recipient.id))
      if (isFirstClick) {
        await db.update(newsletterSends)
          .set({ clickedCount: sql`${newsletterSends.clickedCount} + 1` })
          .where(eq(newsletterSends.id, recipient.sendId))
      }
      if (metadata?.click_url) {
        await db.insert(newsletterLinkClicks).values({
          sendId: recipient.sendId, recipientId: recipient.id, url: metadata.click_url, clickedAt: timestamp,
        })
      }
      break
    }
    case 'bounced': {
      await db.update(newsletterRecipients)
        .set({ status: 'bounced', bouncedAt: timestamp, bounceType: metadata?.bounce_type ?? null })
        .where(eq(newsletterRecipients.id, recipient.id))
      await db.update(newsletterSends)
        .set({ bouncedCount: sql`${newsletterSends.bouncedCount} + 1` })
        .where(eq(newsletterSends.id, recipient.sendId))
      if (metadata?.bounce_type === 'hard') {
        await db.update(newsletterSubscribers)
          .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
          .where(and(eq(newsletterSubscribers.email, recipient.email), eq(newsletterSubscribers.status, 'confirmed')))
      }
      break
    }
    case 'complained': {
      await db.update(newsletterRecipients)
        .set({ status: 'complained', complainedAt: timestamp })
        .where(eq(newsletterRecipients.id, recipient.id))
      await db.update(newsletterSends)
        .set({ complainedCount: sql`${newsletterSends.complainedCount} + 1` })
        .where(eq(newsletterSends.id, recipient.sendId))
      await db.update(newsletterSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
        .where(and(eq(newsletterSubscribers.email, recipient.email), eq(newsletterSubscribers.status, 'confirmed')))
      break
    }
  }
}

export async function getRecipientByResendId(resendEmailId: string): Promise<{ email: string; site_id: string } | null> {
  const db = getDb()
  const rows = await db
    .select({ email: newsletterRecipients.email, siteId: newsletterSends.siteId })
    .from(newsletterRecipients)
    .innerJoin(newsletterSends, eq(newsletterSends.id, newsletterRecipients.sendId))
    .where(eq(newsletterRecipients.resendEmailId, resendEmailId))
    .limit(1)
  if (rows.length === 0) return null
  return { email: rows[0].email, site_id: rows[0].siteId }
}

export async function getNewsletterSendsWithStats(siteId: string): Promise<NewsletterSendStats[]> {
  const db = getDb()
  const rows = await db.select().from(newsletterSends)
    .where(eq(newsletterSends.siteId, siteId))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, sent_at: r.sentAt, recipient_count: r.recipientCount, status: r.status,
    delivered_count: r.deliveredCount, clicked_count: r.clickedCount,
    bounced_count: r.bouncedCount, complained_count: r.complainedCount,
  }))
}

export async function getSendBlocksJson(sendId: number): Promise<string | null> {
  const db = getDb()
  const rows = await db.select({ blocksJson: newsletterSends.blocksJson })
    .from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1)
  return rows[0]?.blocksJson ?? null
}

export async function getRecipientsForSend(sendId: number): Promise<NewsletterRecipient[]> {
  const db = getDb()
  return db.select().from(newsletterRecipients)
    .where(eq(newsletterRecipients.sendId, sendId))
    .orderBy(newsletterRecipients.email)
}

export async function getFailedRecipientsForSend(siteId: string, sendId: number): Promise<{ email: string; token: string }[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT s.email, s.token
    FROM newsletter_recipients nr
    JOIN newsletter_subscribers s ON s.email = nr.email AND s.status = 'confirmed' AND s.site_id = ${siteId}
    WHERE nr.send_id = ${sendId} AND nr.resend_email_id IS NULL
  `)
  return (rows.rows ?? []).map((r) => ({ email: r.email as string, token: r.token as string }))
}

export async function updateRecipientResendId(sendId: number, email: string, resendEmailId: string): Promise<void> {
  const db = getDb()
  await db.update(newsletterRecipients)
    .set({ resendEmailId, status: 'sent' })
    .where(and(eq(newsletterRecipients.sendId, sendId), eq(newsletterRecipients.email, email)))
}

export async function getLinkClicksForSend(sendId: number): Promise<LinkClickStats[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT url, COUNT(*) as click_count, COUNT(DISTINCT recipient_id) as unique_clickers
    FROM newsletter_link_clicks WHERE send_id = ${sendId}
    GROUP BY url ORDER BY click_count DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    url: r.url as string, click_count: r.click_count as number, unique_clickers: r.unique_clickers as number,
  }))
}

export async function getOverallNewsletterStats(siteId: string): Promise<OverallStats> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      COUNT(*) as total_sends, SUM(recipient_count) as total_recipients,
      CASE WHEN SUM(recipient_count) > 0 THEN ROUND(CAST(SUM(clicked_count) AS REAL) / SUM(recipient_count) * 100, 1) ELSE 0 END as avg_click_rate,
      CASE WHEN SUM(recipient_count) > 0 THEN ROUND(CAST(SUM(bounced_count) AS REAL) / SUM(recipient_count) * 100, 1) ELSE 0 END as avg_bounce_rate,
      SUM(complained_count) as total_complaints
    FROM newsletter_sends WHERE site_id = ${siteId}
  `)
  const r = rows.rows?.[0] ?? {}
  return {
    total_sends: (r.total_sends as number) || 0, total_recipients: (r.total_recipients as number) || 0,
    avg_click_rate: (r.avg_click_rate as number) || 0,
    avg_bounce_rate: (r.avg_bounce_rate as number) || 0, total_complaints: (r.total_complaints as number) || 0,
  }
}

// ─── Trends ─────────────────────────────────────────────────────────────

export async function getNewsletterTrends(siteId: string): Promise<SendTrend[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT id, subject, sent_at, recipient_count,
      CASE WHEN recipient_count > 0 THEN ROUND(CAST(clicked_count AS REAL) / recipient_count * 100, 1) ELSE 0 END as click_rate,
      CASE WHEN recipient_count > 0 THEN ROUND(CAST(bounced_count AS REAL) / recipient_count * 100, 1) ELSE 0 END as bounce_rate
    FROM newsletter_sends WHERE site_id = ${siteId} ORDER BY sent_at ASC
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number, subject: r.subject as string, sent_at: r.sent_at as string,
    recipient_count: (r.recipient_count as number) || 0,
    click_rate: (r.click_rate as number) || 0, bounce_rate: (r.bounce_rate as number) || 0,
  }))
}

export async function getSubscriberGrowth(siteId: string): Promise<SubscriberGrowth[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT strftime('%Y-%m', confirmed_at) as month, COUNT(*) as new_count
    FROM newsletter_subscribers
    WHERE site_id = ${siteId} AND status = 'confirmed' AND confirmed_at IS NOT NULL
    GROUP BY month ORDER BY month ASC
  `)
  let cumulative = 0
  return (rows.rows ?? []).map((r) => {
    const newCount = (r.new_count as number) || 0
    cumulative += newCount
    return { month: r.month as string, total: cumulative, new_count: newCount }
  })
}
