import { eq, and, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterSubscribers,
  subscriberTagSignals,
} from './schema'

export type Subscriber = typeof newsletterSubscribers.$inferSelect

export interface SubscriberEnriched extends Subscriber {
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags: string[]
}

export async function createSubscriber(siteId: string, email: string): Promise<{ token: string; alreadyConfirmed: boolean }> {
  const db = getDb()
  const token = crypto.randomUUID()

  const existing = await db.select({
    id: newsletterSubscribers.id,
    status: newsletterSubscribers.status,
    token: newsletterSubscribers.token,
  })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
    .limit(1)

  if (existing.length > 0) {
    const { status, token: existingToken } = existing[0]

    if (status === 'confirmed') {
      return { token: existingToken, alreadyConfirmed: true }
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

// Loescht pending Subscriber, deren Anmeldung laenger als maxAgeDays zurueckliegt.
// DSGVO Art. 5.1.e: Speicherbegrenzung — unverbindliche Eintraege duerfen nicht
// dauerhaft aufbewahrt werden. batchLimit verhindert, dass ein grosser Backlog
// beim ersten Lauf das DB-Lock zu lange haelt.
export async function cleanupExpiredPendingSubscribers(
  maxAgeDays = 14,
  batchLimit = 1000,
): Promise<{ deleted: number; batchHit: boolean }> {
  const db = getDb()
  const cutoffSql = `-${maxAgeDays} days`

  const candidates = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.status, 'pending'),
      sql`datetime(${newsletterSubscribers.createdAt}) < datetime('now', ${cutoffSql})`,
    ))
    .limit(batchLimit)

  if (candidates.length === 0) {
    return { deleted: 0, batchHit: false }
  }

  const ids = candidates.map((c) => c.id)
  await db.delete(newsletterSubscribers).where(inArray(newsletterSubscribers.id, ids))

  return { deleted: ids.length, batchHit: ids.length >= batchLimit }
}
