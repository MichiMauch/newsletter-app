import { sql } from 'drizzle-orm'
import { getDb } from './db'

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
