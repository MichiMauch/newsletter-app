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

export interface ComplianceContext {
  ip?: string | null
  userAgent?: string | null
}

export async function createSubscriber(
  siteId: string,
  email: string,
  ctx?: ComplianceContext,
): Promise<{ token: string; alreadyConfirmed: boolean }> {
  const db = getDb()
  const token = crypto.randomUUID()
  const subscribedIp = ctx?.ip ?? null
  const subscribedUserAgent = ctx?.userAgent ?? null

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
      // Re-subscribe: reset opt-in trail. Old IP/UA from a previous lifecycle
      // would be misleading — the new signup is the relevant consent event.
      await db.update(newsletterSubscribers)
        .set({
          status: 'pending',
          token,
          unsubscribedAt: null,
          subscribedIp,
          subscribedUserAgent,
          confirmedAt: null,
          confirmedIp: null,
          confirmedUserAgent: null,
        })
        .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
      return { token, alreadyConfirmed: false }
    }

    // Status is pending — regenerate token but refresh consent trail too,
    // since the user just acted again.
    await db.update(newsletterSubscribers)
      .set({ token, subscribedIp, subscribedUserAgent })
      .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email)))
    return { token, alreadyConfirmed: false }
  }

  await db.insert(newsletterSubscribers).values({
    siteId,
    email,
    status: 'pending',
    token,
    subscribedIp,
    subscribedUserAgent,
  })
  return { token, alreadyConfirmed: false }
}

export async function confirmSubscriber(token: string, ctx?: ComplianceContext): Promise<boolean> {
  const db = getDb()
  const result = await db.update(newsletterSubscribers)
    .set({
      status: 'confirmed',
      confirmedAt: sql`datetime('now')`,
      confirmedIp: ctx?.ip ?? null,
      confirmedUserAgent: ctx?.userAgent ?? null,
    })
    .where(and(eq(newsletterSubscribers.token, token), eq(newsletterSubscribers.status, 'pending')))
  return (result.rowsAffected ?? 0) > 0
}

// Bestätigt einen Subscriber per (siteId, email) statt per Token. Wird vom
// HMAC-basierten Confirm-Flow aufgerufen, nachdem das Token verifiziert wurde —
// die Identifizierung des Subscribers steckt dann bereits im Token, nicht in
// einer DB-Spalte.
export async function confirmSubscriberByEmail(
  siteId: string,
  email: string,
  ctx?: ComplianceContext,
): Promise<boolean> {
  const db = getDb()
  const normalized = email.trim().toLowerCase()
  const result = await db.update(newsletterSubscribers)
    .set({
      status: 'confirmed',
      confirmedAt: sql`datetime('now')`,
      confirmedIp: ctx?.ip ?? null,
      confirmedUserAgent: ctx?.userAgent ?? null,
    })
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      eq(newsletterSubscribers.email, normalized),
      eq(newsletterSubscribers.status, 'pending'),
    ))
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
      s.subscribed_ip, s.subscribed_user_agent, s.confirmed_ip, s.confirmed_user_agent,
      s.first_name,
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
    subscribedIp: (r.subscribed_ip as string | null) ?? null,
    subscribedUserAgent: (r.subscribed_user_agent as string | null) ?? null,
    confirmedIp: (r.confirmed_ip as string | null) ?? null,
    confirmedUserAgent: (r.confirmed_user_agent as string | null) ?? null,
    firstName: (r.first_name as string | null) ?? null,
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

export async function getSubscriberByEmail(
  siteId: string,
  email: string,
): Promise<{ email: string; token: string; firstName: string | null } | null> {
  const db = getDb()
  const rows = await db.select({
    email: newsletterSubscribers.email,
    token: newsletterSubscribers.token,
    firstName: newsletterSubscribers.firstName,
  })
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

// Sets the optional first name. Token is the subscriber's stable unsubscribe
// token — we accept the same trade-off the unsubscribe link makes (anyone with
// the token can unsub, so being able to edit a display-only first name is no
// worse). The proper fix lives in the Preference-Center issue (af8) where the
// edit capability moves to its own scoped HMAC token.
export async function updateFirstName(token: string, firstName: string | null): Promise<boolean> {
  const db = getDb()
  const trimmed = firstName === null ? null : firstName.trim().slice(0, 100)
  const value = trimmed === '' ? null : trimmed
  const result = await db.update(newsletterSubscribers)
    .set({ firstName: value })
    .where(eq(newsletterSubscribers.token, token))
  return (result.rowsAffected ?? 0) > 0
}

// Batch-loads first names for a set of emails — used at send fan-out time to
// substitute {{firstName}} in the rendered email without N+1 lookups.
export async function getFirstNamesByEmails(
  siteId: string,
  emails: string[],
): Promise<Map<string, string | null>> {
  if (emails.length === 0) return new Map()
  const db = getDb()
  const rows = await db
    .select({ email: newsletterSubscribers.email, firstName: newsletterSubscribers.firstName })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      inArray(newsletterSubscribers.email, emails),
    ))
  return new Map(rows.map((r) => [r.email, r.firstName ?? null]))
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
