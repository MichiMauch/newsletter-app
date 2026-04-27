import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterSubscribers,
  newsletterSends,
  newsletterRecipients,
  newsletterLinkClicks,
  newsletterSendVariants,
} from './schema'

export interface NewsletterSend {
  id: number
  site_id: string
  post_slug: string
  post_title: string
  subject: string
  preheader: string | null
  sent_at: string
  scheduled_for: string | null
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

export interface NewsletterRecipientRow {
  id: number
  email: string
  resend_email_id: string | null
  status: NewsletterRecipient['status']
  delivered_at: string | null
  clicked_at: string | null
  click_count: number
  bounced_at: string | null
  bounce_type: string | null
  bounce_sub_type: string | null
  bounce_message: string | null
  complained_at: string | null
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
}

export async function recordNewsletterSend(siteId: string, data: {
  post_slug: string
  post_title: string
  subject: string
  preheader?: string | null
  recipient_count: number
  blocks_json?: string
  scheduled_for?: string
  status?: 'sent' | 'scheduled'
}): Promise<number> {
  const db = getDb()
  const result = await db.insert(newsletterSends).values({
    siteId,
    postSlug: data.post_slug,
    postTitle: data.post_title,
    subject: data.subject,
    preheader: data.preheader ?? null,
    recipientCount: data.recipient_count,
    blocksJson: data.blocks_json ?? null,
    scheduledFor: data.scheduled_for ?? null,
    status: data.status ?? 'sent',
  }).returning({ id: newsletterSends.id })
  return result[0].id
}

export async function cancelNewsletterSend(sendId: number): Promise<void> {
  const db = getDb()
  await db.update(newsletterSends)
    .set({ status: 'cancelled' })
    .where(and(eq(newsletterSends.id, sendId), eq(newsletterSends.status, 'scheduled')))
}

export async function markScheduledSendAsSent(sendId: number): Promise<void> {
  const db = getDb()
  // Nur als 'sent' markieren, wenn der geplante Zeitpunkt erreicht ist.
  // Bei sofortigem Push eines geplanten Sends wartet der parent-Status, bis
  // scheduled_for tatsächlich vorbei ist — sonst zeigt die UI 'sent' an,
  // obwohl Resend die Mail erst später rausschickt.
  await db.run(sql`
    UPDATE newsletter_sends
    SET status = 'sent'
    WHERE id = ${sendId}
      AND status = 'scheduled'
      AND (scheduled_for IS NULL OR datetime(scheduled_for) <= datetime('now'))
  `)
}

export async function getLastSendWithBlocks(siteId: string): Promise<{ subject: string; preheader: string | null; blocks_json: string; post_slug: string } | null> {
  const db = getDb()
  const rows = await db.select({
    subject: newsletterSends.subject,
    preheader: newsletterSends.preheader,
    blocks_json: newsletterSends.blocksJson,
    post_slug: newsletterSends.postSlug,
  }).from(newsletterSends)
    .where(and(eq(newsletterSends.siteId, siteId), eq(newsletterSends.status, 'sent')))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
    .limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, preheader: row.preheader, blocks_json: row.blocks_json, post_slug: row.post_slug }
}

export async function getSendForRetry(sendId: number): Promise<{ subject: string; preheader: string | null; blocks_json: string } | null> {
  const db = getDb()
  const rows = await db.select({
    subject: newsletterSends.subject,
    preheader: newsletterSends.preheader,
    blocks_json: newsletterSends.blocksJson,
  })
    .from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1)
  const row = rows[0]
  if (!row || !row.blocks_json) return null
  return { subject: row.subject, preheader: row.preheader, blocks_json: row.blocks_json }
}

export async function getNewsletterSends(siteId: string): Promise<NewsletterSend[]> {
  const db = getDb()
  const rows = await db.select().from(newsletterSends)
    .where(eq(newsletterSends.siteId, siteId))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, preheader: r.preheader, sent_at: r.sentAt, scheduled_for: r.scheduledFor,
    recipient_count: r.recipientCount, status: r.status,
  }))
}

// ─── Recipient Tracking ─────────────────────────────────────────────

export async function recordNewsletterRecipientsBatch(
  recipients: { send_id: number; email: string; resend_email_id: string | null; variant_label?: string | null }[],
): Promise<void> {
  if (recipients.length === 0) return
  const db = getDb()
  const CHUNK_SIZE = 50
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    await db.insert(newsletterRecipients).values(
      chunk.map((r) => ({
        sendId: r.send_id,
        email: r.email,
        resendEmailId: r.resend_email_id,
        variantLabel: r.variant_label ?? null,
      })),
    )
  }
}

export async function updateRecipientEvent(
  resendEmailId: string,
  event: 'delivered' | 'clicked' | 'bounced' | 'complained',
  timestamp: string,
  metadata?: { bounce_type?: string; bounce_sub_type?: string; bounce_message?: string; click_url?: string },
): Promise<void> {
  const db = getDb()

  // Join newsletter_sends to recover the site this recipient belongs to —
  // bounce/complaint state must be scoped to the originating site so a webhook
  // event for site A does not flip subscribers of site B who happen to share
  // the same email (the schema's uniqueIndex on (siteId, email) explicitly
  // allows the same address across sites).
  const existing = await db
    .select({
      id: newsletterRecipients.id,
      sendId: newsletterRecipients.sendId,
      email: newsletterRecipients.email,
      status: newsletterRecipients.status,
      clickCount: newsletterRecipients.clickCount,
      variantLabel: newsletterRecipients.variantLabel,
      siteId: newsletterSends.siteId,
    })
    .from(newsletterRecipients)
    .innerJoin(newsletterSends, eq(newsletterSends.id, newsletterRecipients.sendId))
    .where(eq(newsletterRecipients.resendEmailId, resendEmailId))
    .limit(1)

  if (existing.length === 0) return

  const recipient = existing[0]
  if (recipient.status === 'bounced' || recipient.status === 'complained') return

  async function bumpVariant(field: 'deliveredCount' | 'clickedCount' | 'bouncedCount' | 'complainedCount') {
    if (!recipient.variantLabel) return
    const column = newsletterSendVariants[field]
    await db.update(newsletterSendVariants)
      .set({ [field]: sql`${column} + 1` })
      .where(and(
        eq(newsletterSendVariants.sendId, recipient.sendId),
        eq(newsletterSendVariants.label, recipient.variantLabel),
      ))
  }

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
        await bumpVariant('deliveredCount')
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
        await bumpVariant('clickedCount')
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
        .set({
          status: 'bounced',
          bouncedAt: timestamp,
          bounceType: metadata?.bounce_type ?? null,
          bounceSubType: metadata?.bounce_sub_type ?? null,
          bounceMessage: metadata?.bounce_message ?? null,
        })
        .where(eq(newsletterRecipients.id, recipient.id))
      await db.update(newsletterSends)
        .set({ bouncedCount: sql`${newsletterSends.bouncedCount} + 1` })
        .where(eq(newsletterSends.id, recipient.sendId))
      await bumpVariant('bouncedCount')
      if (metadata?.bounce_type === 'hard') {
        await db.update(newsletterSubscribers)
          .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
          .where(and(
            eq(newsletterSubscribers.siteId, recipient.siteId),
            eq(newsletterSubscribers.email, recipient.email),
            eq(newsletterSubscribers.status, 'confirmed'),
          ))
      } else {
        // Soft/unknown bounce: suspend after threshold in rolling window.
        // Schwelle = 3 in 90 Tagen, gezählt nur für DIESE Site — sonst könnte
        // ein Webhook-Event für Site A die Schwelle für Site B überschreiten.
        // Resend liefert bounce_type oft als undefined, daher zählen wir alles
        // ausser explizit 'hard'.
        const SOFT_BOUNCE_THRESHOLD = 3
        const counted = await db.run(sql`
          SELECT COUNT(*) AS count
          FROM newsletter_recipients nr
          JOIN newsletter_sends ns ON ns.id = nr.send_id
          WHERE nr.email = ${recipient.email}
            AND ns.site_id = ${recipient.siteId}
            AND nr.status = 'bounced'
            AND (nr.bounce_type IS NULL OR nr.bounce_type != 'hard')
            AND nr.bounced_at IS NOT NULL
            AND nr.bounced_at > datetime('now', '-90 days')
        `)
        const softCount = (counted.rows?.[0]?.count as number) ?? 0
        if (softCount >= SOFT_BOUNCE_THRESHOLD) {
          await db.update(newsletterSubscribers)
            .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
            .where(and(
              eq(newsletterSubscribers.siteId, recipient.siteId),
              eq(newsletterSubscribers.email, recipient.email),
              eq(newsletterSubscribers.status, 'confirmed'),
            ))
        }
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
      await bumpVariant('complainedCount')
      await db.update(newsletterSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: sql`datetime('now')` })
        .where(and(
          eq(newsletterSubscribers.siteId, recipient.siteId),
          eq(newsletterSubscribers.email, recipient.email),
          eq(newsletterSubscribers.status, 'confirmed'),
        ))
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
    .orderBy(sql`COALESCE(${newsletterSends.scheduledFor}, ${newsletterSends.sentAt}) DESC`)
  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, post_slug: r.postSlug, post_title: r.postTitle,
    subject: r.subject, preheader: r.preheader, sent_at: r.sentAt, scheduled_for: r.scheduledFor,
    recipient_count: r.recipientCount, status: r.status,
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

export async function getRecipientsForSend(siteId: string, sendId: number): Promise<NewsletterRecipientRow[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      nr.id, nr.email, nr.resend_email_id, nr.status,
      nr.delivered_at, nr.clicked_at, nr.click_count,
      nr.bounced_at, nr.bounce_type, nr.bounce_sub_type, nr.bounce_message,
      nr.complained_at,
      se.score AS engagement_score, se.tier AS engagement_tier
    FROM newsletter_recipients nr
    LEFT JOIN subscriber_engagement se
      ON se.site_id = ${siteId} AND se.subscriber_email = nr.email
    WHERE nr.send_id = ${sendId}
    ORDER BY nr.email
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    email: r.email as string,
    resend_email_id: (r.resend_email_id as string | null) ?? null,
    status: r.status as NewsletterRecipientRow['status'],
    delivered_at: (r.delivered_at as string | null) ?? null,
    clicked_at: (r.clicked_at as string | null) ?? null,
    click_count: (r.click_count as number) ?? 0,
    bounced_at: (r.bounced_at as string | null) ?? null,
    bounce_type: (r.bounce_type as string | null) ?? null,
    bounce_sub_type: (r.bounce_sub_type as string | null) ?? null,
    bounce_message: (r.bounce_message as string | null) ?? null,
    complained_at: (r.complained_at as string | null) ?? null,
    engagement_score: (r.engagement_score as number | null) ?? null,
    engagement_tier: (r.engagement_tier as NewsletterRecipientRow['engagement_tier']) ?? null,
  }))
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
