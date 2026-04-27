import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import {
  newsletterSubscribers,
  subscriberListMembers,
  subscriberLists,
  subscriberTags,
} from '@/lib/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { addTag, removeTag } from '@/lib/tags'
import { getEngagementScore } from '@/lib/engagement'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
const SEND_HISTORY_LIMIT = 25

interface SubscriberProfile {
  subscriber: {
    id: number
    email: string
    status: 'pending' | 'confirmed' | 'unsubscribed'
    createdAt: string
    confirmedAt: string | null
    unsubscribedAt: string | null
    subscribedIp: string | null
    subscribedUserAgent: string | null
    confirmedIp: string | null
    confirmedUserAgent: string | null
  }
  engagement: {
    score: number
    tier: 'active' | 'moderate' | 'dormant' | 'cold'
    sends_90d: number
    opens_90d: number
    clicks_90d: number
    last_open_at: string | null
    last_click_at: string | null
  } | null
  tags: string[]
  lists: { id: number; name: string }[]
  sends: {
    id: number
    sendId: number
    subject: string
    sent_at: string
    status: 'sent' | 'delivered' | 'clicked' | 'bounced' | 'complained'
    click_count: number
    bounce_type: string | null
  }[]
}

export async function GET(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  const url = new URL(request.url)
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email) {
    return new Response(JSON.stringify({ error: 'email ist erforderlich.' }), { status: 400, headers })
  }

  try {
    const db = getDb()

    const [sub] = await db.select()
      .from(newsletterSubscribers)
      .where(and(
        eq(newsletterSubscribers.siteId, SITE_ID),
        eq(newsletterSubscribers.email, email),
      ))
      .limit(1)

    if (!sub) {
      return new Response(JSON.stringify({ error: 'Abonnent nicht gefunden.' }), { status: 404, headers })
    }

    const [tagRows, listRows, sendRows, engagement] = await Promise.all([
      db.select({ tag: subscriberTags.tag })
        .from(subscriberTags)
        .where(and(
          eq(subscriberTags.siteId, SITE_ID),
          eq(subscriberTags.subscriberEmail, email),
        ))
        .orderBy(asc(subscriberTags.tag)),
      db.select({ id: subscriberLists.id, name: subscriberLists.name })
        .from(subscriberLists)
        .innerJoin(
          subscriberListMembers,
          eq(subscriberListMembers.listId, subscriberLists.id),
        )
        .where(and(
          eq(subscriberLists.siteId, SITE_ID),
          eq(subscriberListMembers.email, email),
        ))
        .orderBy(asc(subscriberLists.name)),
      db.run(sql`
        SELECT
          nr.id, nr.send_id, nr.status, nr.click_count, nr.bounce_type,
          ns.subject, ns.sent_at
        FROM newsletter_recipients nr
        JOIN newsletter_sends ns ON ns.id = nr.send_id
        WHERE nr.email = ${email} AND ns.site_id = ${SITE_ID}
        ORDER BY ns.sent_at DESC
        LIMIT ${SEND_HISTORY_LIMIT}
      `),
      getEngagementScore(SITE_ID, email),
    ])

    const profile: SubscriberProfile = {
      subscriber: {
        id: sub.id,
        email: sub.email,
        status: sub.status,
        createdAt: sub.createdAt,
        confirmedAt: sub.confirmedAt ?? null,
        unsubscribedAt: sub.unsubscribedAt ?? null,
        subscribedIp: sub.subscribedIp ?? null,
        subscribedUserAgent: sub.subscribedUserAgent ?? null,
        confirmedIp: sub.confirmedIp ?? null,
        confirmedUserAgent: sub.confirmedUserAgent ?? null,
      },
      engagement,
      tags: tagRows.map((r) => r.tag),
      lists: listRows.map((r) => ({ id: r.id, name: r.name })),
      sends: (sendRows.rows ?? []).map((r) => ({
        id: r.id as number,
        sendId: r.send_id as number,
        subject: r.subject as string,
        sent_at: r.sent_at as string,
        status: r.status as SubscriberProfile['sends'][number]['status'],
        click_count: (r.click_count as number) ?? 0,
        bounce_type: (r.bounce_type as string | null) ?? null,
      })),
    }

    return new Response(JSON.stringify(profile), { status: 200, headers })
  } catch (err) {
    console.error('[admin/subscriber] GET', err)
    return new Response(JSON.stringify({ error: 'Profil konnte nicht geladen werden.' }), { status: 500, headers })
  }
}

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert.' }), { status: 401, headers })
  }

  let payload: { action?: string; email?: string; tag?: string }
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), { status: 400, headers })
  }

  const action = payload.action
  const email = (payload.email ?? '').trim().toLowerCase()
  const tag = (payload.tag ?? '').trim()

  if (!email) return new Response(JSON.stringify({ error: 'email ist erforderlich.' }), { status: 400, headers })

  try {
    if (action === 'add-tag') {
      if (!tag) return new Response(JSON.stringify({ error: 'tag ist erforderlich.' }), { status: 400, headers })
      await addTag(SITE_ID, email, tag)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    }
    if (action === 'remove-tag') {
      if (!tag) return new Response(JSON.stringify({ error: 'tag ist erforderlich.' }), { status: 400, headers })
      await removeTag(SITE_ID, email, tag)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
    }
    return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), { status: 400, headers })
  } catch (err) {
    console.error('[admin/subscriber] POST', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Aktion fehlgeschlagen.' }), { status: 500, headers })
  }
}
