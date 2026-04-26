/**
 * Engagement-Score pro Subscriber (0-100, Tier active/moderate/dormant/cold)
 *
 * Basis für:
 *  - Re-Engagement-Automation (Trigger 'engagement_below')
 *  - Listen-Hygiene (Tier 'cold' = Kandidat zur Deaktivierung)
 *  - Reporting (welche Subscriber sind wirklich aktiv?)
 *
 * Berechnung über die letzten 90 Tage:
 *   open_rate  = unique_opens  / sends     (max 50 Punkte)
 *   click_rate = unique_clicks / sends     (max 50 Punkte)
 *   recency_factor: <30d = 1.0, <60d = 0.7, <90d = 0.4, sonst 0.1
 *   score = clamp(0, 100, (open_rate * 50 + click_rate * 50) * recency_factor)
 */

import { and, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterRecipients,
  newsletterSends,
  subscriberOpenSignals,
  subscriberEngagement,
  newsletterSubscribers,
} from './schema'

const WINDOW_DAYS = 90

export interface EngagementScore {
  score: number
  tier: 'active' | 'moderate' | 'dormant' | 'cold'
  sends_90d: number
  opens_90d: number
  clicks_90d: number
  last_open_at: string | null
  last_click_at: string | null
}

function tierFromScore(score: number, sends90d: number): EngagementScore['tier'] {
  if (sends90d === 0) return 'cold'
  if (score >= 60) return 'active'
  if (score >= 30) return 'moderate'
  if (score >= 10) return 'dormant'
  return 'cold'
}

function recencyFactor(lastInteractionAt: string | null): number {
  if (!lastInteractionAt) return 0.1
  const ageDays = (Date.now() - new Date(lastInteractionAt).getTime()) / 86_400_000
  if (ageDays < 30) return 1.0
  if (ageDays < 60) return 0.7
  if (ageDays < 90) return 0.4
  return 0.1
}

// ─── Score für einen Subscriber berechnen + UPSERT ────────────────────

export async function computeEngagementScore(siteId: string, email: string): Promise<EngagementScore> {
  const db = getDb()

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  // Sends + Opens + Clicks aus newsletter_recipients in den letzten 90 Tagen
  // (parallel mit Opens aus subscriber_open_signals — beide Queries unabhängig)
  const [stats, opens] = await Promise.all([
    db.run(sql`
      SELECT
        COUNT(*) as sends,
        SUM(CASE WHEN nr.clicked_at IS NOT NULL OR nr.click_count > 0 THEN 1 ELSE 0 END) as clicks,
        MAX(nr.clicked_at) as last_click_at
      FROM newsletter_recipients nr
      JOIN newsletter_sends ns ON ns.id = nr.send_id
      WHERE ns.site_id = ${siteId}
        AND nr.email = ${email}
        AND ns.sent_at >= ${sinceIso}
    `),
    db.run(sql`
      SELECT COUNT(*) as opens, MAX(opened_at_utc) as last_open_at
      FROM subscriber_open_signals
      WHERE site_id = ${siteId}
        AND subscriber_email = ${email}
        AND is_bot_open = 0
        AND opened_at_utc >= ${sinceIso}
    `),
  ])
  const row = stats.rows?.[0] ?? {}
  const sends90d = (row.sends as number) || 0
  const clicks90d = (row.clicks as number) || 0
  const lastClickAt = (row.last_click_at as string | null) ?? null

  const openRow = opens.rows?.[0] ?? {}
  const opens90d = (openRow.opens as number) || 0
  const lastOpenAt = (openRow.last_open_at as string | null) ?? null

  let score = 0
  if (sends90d > 0) {
    const openRate = Math.min(opens90d / sends90d, 1)
    const clickRate = Math.min(clicks90d / sends90d, 1)
    const lastInteraction = [lastOpenAt, lastClickAt].filter(Boolean).sort().pop() ?? null
    const factor = recencyFactor(lastInteraction)
    score = Math.round(Math.min(100, Math.max(0, (openRate * 50 + clickRate * 50) * factor)))
  }

  const tier = tierFromScore(score, sends90d)

  await db.insert(subscriberEngagement).values({
    siteId,
    subscriberEmail: email,
    score,
    tier,
    sends90d,
    opens90d,
    clicks90d,
    lastOpenAt,
    lastClickAt,
    updatedAt: sql`datetime('now')`,
  }).onConflictDoUpdate({
    target: [subscriberEngagement.siteId, subscriberEngagement.subscriberEmail],
    set: {
      score,
      tier,
      sends90d,
      opens90d,
      clicks90d,
      lastOpenAt,
      lastClickAt,
      updatedAt: sql`datetime('now')`,
    },
  })

  return { score, tier, sends_90d: sends90d, opens_90d: opens90d, clicks_90d: clicks90d, last_open_at: lastOpenAt, last_click_at: lastClickAt }
}

// ─── Recompute für alle confirmed Subscriber einer Site ───────────────

export async function recomputeAllEngagement(siteId: string): Promise<{ updated: number }> {
  const db = getDb()

  const subs = await db.select({ email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.status, 'confirmed')))

  let updated = 0
  for (const s of subs) {
    await computeEngagementScore(siteId, s.email)
    updated++
  }
  return { updated }
}

// ─── Score lesen (für Trigger / UI) ────────────────────────────────────

export async function getEngagementScore(siteId: string, email: string): Promise<EngagementScore | null> {
  const db = getDb()
  const rows = await db.select()
    .from(subscriberEngagement)
    .where(and(eq(subscriberEngagement.siteId, siteId), eq(subscriberEngagement.subscriberEmail, email)))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    score: r.score, tier: r.tier,
    sends_90d: r.sends90d, opens_90d: r.opens90d, clicks_90d: r.clicks90d,
    last_open_at: r.lastOpenAt, last_click_at: r.lastClickAt,
  }
}

// ─── Subscriber unter Threshold finden (für Trigger) ──────────────────

export async function getSubscribersBelowScore(siteId: string, threshold: number): Promise<string[]> {
  const db = getDb()
  const rows = await db.select({ email: subscriberEngagement.subscriberEmail })
    .from(subscriberEngagement)
    .where(and(
      eq(subscriberEngagement.siteId, siteId),
      sql`${subscriberEngagement.score} < ${threshold}`,
      sql`${subscriberEngagement.sends90d} > 0`, // nur Subscriber, die etwas erhalten haben
    ))
  return rows.map((r) => r.email)
}
