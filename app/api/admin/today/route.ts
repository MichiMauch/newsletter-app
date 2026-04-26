import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { newsletterSubscribers, newsletterRecipients, newsletterSends } from '@/lib/schema'
import { and, asc, eq, gt, gte, isNotNull, lte, sql } from 'drizzle-orm'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'

function startOfTodayLocal(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function in24Hours(): string {
  const d = new Date()
  d.setHours(d.getHours() + 24)
  return d.toISOString()
}

export async function GET(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  try {
    const db = getDb()
    const dayStart = startOfTodayLocal()
    const dayEnd = in24Hours()
    const nowIso = new Date().toISOString()

    const [newSubsRow] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(newsletterSubscribers)
      .where(and(
        eq(newsletterSubscribers.siteId, SITE_ID),
        gte(newsletterSubscribers.createdAt, dayStart),
      ))

    const [unsubsRow] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(newsletterSubscribers)
      .where(and(
        eq(newsletterSubscribers.siteId, SITE_ID),
        isNotNull(newsletterSubscribers.unsubscribedAt),
        gte(newsletterSubscribers.unsubscribedAt, dayStart),
      ))

    const [bouncesRow] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(newsletterRecipients)
      .where(and(
        isNotNull(newsletterRecipients.bouncedAt),
        gte(newsletterRecipients.bouncedAt, dayStart),
      ))

    const upcomingSends = await db.select({
      id: newsletterSends.id,
      subject: newsletterSends.subject,
      scheduledFor: newsletterSends.scheduledFor,
      recipientCount: newsletterSends.recipientCount,
    })
      .from(newsletterSends)
      .where(and(
        eq(newsletterSends.siteId, SITE_ID),
        eq(newsletterSends.status, 'scheduled'),
        gt(newsletterSends.scheduledFor, nowIso),
        lte(newsletterSends.scheduledFor, dayEnd),
      ))
      .orderBy(asc(newsletterSends.scheduledFor))
      .limit(5)

    return new Response(
      JSON.stringify({
        newSubscribersToday: newSubsRow?.count ?? 0,
        unsubscribedToday: unsubsRow?.count ?? 0,
        bouncesToday: bouncesRow?.count ?? 0,
        upcomingSends: upcomingSends.map((s) => ({
          id: s.id,
          subject: s.subject,
          scheduledFor: s.scheduledFor,
          recipientCount: s.recipientCount,
        })),
      }),
      { status: 200, headers },
    )
  } catch (err) {
    console.error('[admin/today]', err)
    return new Response(JSON.stringify({ error: 'Heute-Daten konnten nicht geladen werden.' }), { status: 500, headers })
  }
}
