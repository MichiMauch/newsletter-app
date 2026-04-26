import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { newsletterSubscribers, newsletterSends } from '@/lib/schema'
import { and, asc, eq, gt, sql } from 'drizzle-orm'

const SITE_ID = 'kokomo'

export async function GET(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  try {
    const db = getDb()
    const nowIso = new Date().toISOString()

    const [confirmedRow] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(newsletterSubscribers)
      .where(and(
        eq(newsletterSubscribers.siteId, SITE_ID),
        eq(newsletterSubscribers.status, 'confirmed'),
      ))

    const upcoming = await db.select({
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
      ))
      .orderBy(asc(newsletterSends.scheduledFor))
      .limit(1)

    return new Response(
      JSON.stringify({
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
        confirmedSubscribers: confirmedRow?.count ?? 0,
        nextScheduledSend: upcoming[0]
          ? {
              id: upcoming[0].id,
              subject: upcoming[0].subject,
              scheduledFor: upcoming[0].scheduledFor,
              recipientCount: upcoming[0].recipientCount,
            }
          : null,
      }),
      { status: 200, headers },
    )
  } catch (err) {
    console.error('[admin/status]', err)
    return new Response(JSON.stringify({ error: 'Status konnte nicht geladen werden.' }), { status: 500, headers })
  }
}
