/**
 * Subscription Center API.
 *
 * Identifiziert sich mit dem Subscriber-Token (newsletter_subscribers.token,
 * der "Master-Token"). Erlaubt dem User, Profil-Felder (E-Mail, Vorname) und
 * Listen-Mitgliedschaften zu pflegen.
 *
 * Die Sicherheit folgt dem gleichen Trade-off wie der Unsubscribe-Link:
 * Wer den Token hat, kann auch die Mitgliedschaften toggeln und die E-Mail
 * aendern. Email-Aenderungen, die zu einer Kollision in der Stammliste fuehren
 * wuerden (gleiche siteId+email schon vergeben), werden mit 409 abgelehnt.
 */

import { and, eq, ne, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { newsletterSubscribers, subscriberLists, subscriberListMembers } from '@/lib/schema'
import { addSubscriberToLists } from '@/lib/newsletter-subscribers'
import { getMembershipsForSubscriber } from '@/lib/lists'
import { isValidEmail } from '@/lib/validators'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const PREFS_MAX_REQUESTS = 30
const PREFS_WINDOW_MS = 60 * 60 * 1000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function GET(request: Request) {
  const ip = getClientIp(request)
  const { allowed } = await checkRateLimit(`prefs-get:${ip}`, PREFS_MAX_REQUESTS, PREFS_WINDOW_MS)
  if (!allowed) return json({ error: 'Zu viele Anfragen.' }, 429)

  const token = new URL(request.url).searchParams.get('token')
  if (!token) return json({ error: 'Token fehlt.' }, 400)
  return loadState(token)
}

export async function PATCH(request: Request) {
  const ip = getClientIp(request)
  const { allowed } = await checkRateLimit(`prefs-patch:${ip}`, PREFS_MAX_REQUESTS, PREFS_WINDOW_MS)
  if (!allowed) return json({ error: 'Zu viele Anfragen.' }, 429)

  let body: { token?: unknown; email?: unknown; firstName?: unknown; memberships?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Ungültiger Body.' }, 400)
  }
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return json({ error: 'Token fehlt.' }, 400)

  const db = getDb()
  const subRows = await db.select({
    id: newsletterSubscribers.id,
    siteId: newsletterSubscribers.siteId,
    email: newsletterSubscribers.email,
  })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.token, token))
    .limit(1)
  const sub = subRows[0]
  if (!sub) return json({ error: 'Subscriber nicht gefunden.' }, 404)

  // Email change
  if (typeof body.email === 'string') {
    const newEmail = body.email.trim().toLowerCase()
    if (!isValidEmail(newEmail)) return json({ error: 'Ungültige E-Mail.' }, 400)
    if (newEmail !== sub.email) {
      const collision = await db.select({ id: newsletterSubscribers.id })
        .from(newsletterSubscribers)
        .where(and(
          eq(newsletterSubscribers.siteId, sub.siteId),
          eq(newsletterSubscribers.email, newEmail),
          ne(newsletterSubscribers.id, sub.id),
        ))
        .limit(1)
      if (collision[0]) return json({ error: 'Diese E-Mail ist bereits in der Stammliste.' }, 409)
      await db.update(newsletterSubscribers)
        .set({ email: newEmail })
        .where(eq(newsletterSubscribers.id, sub.id))
    }
  }

  // First name
  if (typeof body.firstName === 'string') {
    const trimmed = body.firstName.trim().slice(0, 100)
    await db.update(newsletterSubscribers)
      .set({ firstName: trimmed === '' ? null : trimmed })
      .where(eq(newsletterSubscribers.id, sub.id))
  }

  // Memberships toggle: target = welche Listen er nach dem Patch in Membership hat.
  if (Array.isArray(body.memberships)) {
    const targetIds = body.memberships
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

    // Aktuelle Mitgliedschaften (gefiltert auf Site).
    const current = await db.select({
      listId: subscriberListMembers.listId,
    })
      .from(subscriberListMembers)
      .innerJoin(subscriberLists, eq(subscriberLists.id, subscriberListMembers.listId))
      .where(and(
        eq(subscriberListMembers.subscriberId, sub.id),
        eq(subscriberLists.siteId, sub.siteId),
      ))
    const currentSet = new Set(current.map((r) => r.listId))
    const targetSet = new Set(targetIds)

    const toRemove = [...currentSet].filter((id) => !targetSet.has(id))
    const toAdd = [...targetSet].filter((id) => !currentSet.has(id))

    if (toRemove.length > 0) {
      await db.delete(subscriberListMembers)
        .where(and(
          eq(subscriberListMembers.subscriberId, sub.id),
          inArray(subscriberListMembers.listId, toRemove),
        ))
    }
    if (toAdd.length > 0) {
      await addSubscriberToLists(sub.id, sub.siteId, toAdd)
    }
  }

  return loadState(token)
}

async function loadState(token: string) {
  const db = getDb()
  const subRows = await db.select({
    id: newsletterSubscribers.id,
    siteId: newsletterSubscribers.siteId,
    email: newsletterSubscribers.email,
    firstName: newsletterSubscribers.firstName,
    status: newsletterSubscribers.status,
  })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.token, token))
    .limit(1)
  const sub = subRows[0]
  if (!sub) return json({ error: 'Subscriber nicht gefunden.' }, 404)

  const [memberships, lists] = await Promise.all([
    getMembershipsForSubscriber(sub.id),
    db.select({
      id: subscriberLists.id,
      name: subscriberLists.name,
      slug: subscriberLists.slug,
      description: subscriberLists.description,
    })
      .from(subscriberLists)
      .where(eq(subscriberLists.siteId, sub.siteId))
      .orderBy(subscriberLists.name),
  ])

  return json({
    subscriber: {
      email: sub.email,
      firstName: sub.firstName ?? '',
      status: sub.status,
    },
    memberships: memberships.map((m) => ({
      listId: m.listId,
      name: m.name,
      slug: m.slug,
    })),
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description ?? null,
    })),
  })
}
