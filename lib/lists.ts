/**
 * Newsletter-Listen — jeder Member ist eine Referenz auf einen Subscriber
 * der Stammliste (newsletter_subscribers). E-Mail wird via JOIN aufgeloest;
 * E-Mail-Aenderung am Subscriber wirkt damit automatisch in allen Listen.
 *
 * Genau eine Liste pro Site darf is_primary=1 sein (Hauptnewsletter, in den
 * neue Subscribes per Default eingetragen werden).
 */

import { and, eq, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import { newsletterSubscribers, subscriberLists, subscriberListMembers } from './schema'

export interface SubscriberListSummary {
  id: number
  site_id: string
  name: string
  description: string | null
  is_primary: boolean
  created_at: string
  member_count: number
}

export interface SubscriberListMember {
  id: number
  list_id: number
  subscriber_id: number
  email: string
  first_name: string | null
  status: 'pending' | 'active' | 'blocked'
  token: string
  added_at: string
}

// ─── Listen ────────────────────────────────────────────────────────────

export async function createList(siteId: string, name: string, description?: string): Promise<number> {
  const db = getDb()
  const result = await db.insert(subscriberLists).values({
    siteId,
    name,
    description: description ?? null,
  }).returning({ id: subscriberLists.id })
  return result[0].id
}

export async function renameList(id: number, name: string, description?: string | null): Promise<void> {
  const db = getDb()
  await db.update(subscriberLists)
    .set({ name, description: description ?? null })
    .where(eq(subscriberLists.id, id))
}

export async function deleteList(id: number): Promise<void> {
  const db = getDb()
  await db.delete(subscriberLists).where(eq(subscriberLists.id, id))
}

/**
 * Markiert eine Liste als Hauptliste — und stellt sicher, dass keine andere
 * Liste derselben Site noch isPrimary=1 ist (applikatorische Eindeutigkeit).
 * makePrimary=false setzt nur die Liste selbst zurueck (lasst die Site ohne
 * Hauptliste stehen, was UI/Subscribe respektieren muss).
 */
export async function setPrimaryList(listId: number, makePrimary: boolean): Promise<void> {
  const db = getDb()
  const list = await db.select({ siteId: subscriberLists.siteId })
    .from(subscriberLists)
    .where(eq(subscriberLists.id, listId))
    .limit(1)
  if (!list[0]) throw new Error(`List ${listId} not found`)
  await db.transaction(async (tx) => {
    if (makePrimary) {
      // Erst alle anderen Listen der Site auf 0 setzen, dann die gewuenschte auf 1.
      await tx.update(subscriberLists)
        .set({ isPrimary: 0 })
        .where(and(eq(subscriberLists.siteId, list[0].siteId), eq(subscriberLists.isPrimary, 1)))
      await tx.update(subscriberLists)
        .set({ isPrimary: 1 })
        .where(eq(subscriberLists.id, listId))
    } else {
      await tx.update(subscriberLists)
        .set({ isPrimary: 0 })
        .where(eq(subscriberLists.id, listId))
    }
  })
}

export async function getLists(siteId: string): Promise<SubscriberListSummary[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.description, l.is_primary, l.created_at,
           COUNT(m.id) as member_count
    FROM subscriber_lists l
    LEFT JOIN subscriber_list_members m ON m.list_id = l.id
    WHERE l.site_id = ${siteId}
    GROUP BY l.id
    ORDER BY l.is_primary DESC, l.created_at DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    site_id: r.site_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    is_primary: Number(r.is_primary) === 1,
    created_at: r.created_at as string,
    member_count: r.member_count as number,
  }))
}

export async function getList(id: number): Promise<SubscriberListSummary | null> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.description, l.is_primary, l.created_at,
           COUNT(m.id) as member_count
    FROM subscriber_lists l
    LEFT JOIN subscriber_list_members m ON m.list_id = l.id
    WHERE l.id = ${id}
    GROUP BY l.id
  `)
  const r = rows.rows?.[0]
  if (!r) return null
  return {
    id: r.id as number,
    site_id: r.site_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    is_primary: Number(r.is_primary) === 1,
    created_at: r.created_at as string,
    member_count: r.member_count as number,
  }
}

// ─── Members ────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  return EMAIL_REGEX.test(trimmed) ? trimmed : null
}

/**
 * Traegt eine Liste von E-Mails als Member ein. Jede E-Mail muss einen
 * Subscriber in der Site haben (matched ueber newsletter_subscribers.email).
 * Subscriber, die noch nicht existieren, werden NICHT angelegt — der
 * Aufrufer (Admin-UI) muss vorher 'createSubscriber' verwenden, damit der
 * Double-Opt-In-Flow sauber bleibt.
 */
export async function addMembers(listId: number, emails: string[]): Promise<{
  added: number
  skipped_invalid: number
  skipped_unknown: number
  skipped_duplicate: number
}> {
  if (emails.length === 0) {
    return { added: 0, skipped_invalid: 0, skipped_unknown: 0, skipped_duplicate: 0 }
  }
  const db = getDb()

  const list = await db.select({ siteId: subscriberLists.siteId })
    .from(subscriberLists)
    .where(eq(subscriberLists.id, listId))
    .limit(1)
  if (!list[0]) throw new Error(`List ${listId} not found`)
  const siteId = list[0].siteId

  const valid: string[] = []
  let invalidCount = 0
  for (const raw of emails) {
    const normalized = normalizeEmail(raw)
    if (normalized) valid.push(normalized)
    else invalidCount++
  }
  if (valid.length === 0) {
    return { added: 0, skipped_invalid: invalidCount, skipped_unknown: 0, skipped_duplicate: 0 }
  }

  const subs = await db.select({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
  })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      inArray(newsletterSubscribers.email, valid),
    ))
  const subscriberIdByEmail = new Map(subs.map((r) => [r.email, r.id]))
  const unknownCount = valid.length - subscriberIdByEmail.size

  const subscriberIds = [...subscriberIdByEmail.values()]
  if (subscriberIds.length === 0) {
    return { added: 0, skipped_invalid: invalidCount, skipped_unknown: unknownCount, skipped_duplicate: 0 }
  }

  return addMembersBySubscriberIds(listId, subscriberIds, {
    invalidCount,
    unknownCount,
  })
}

/**
 * Traegt Subscriber-IDs als Member ein. Idempotent — bereits vorhandene
 * Mitgliedschaften werden uebersprungen. Wird vom Subscribe-Flow und vom
 * Admin-Autocomplete verwendet.
 */
export async function addMembersBySubscriberIds(
  listId: number,
  subscriberIds: number[],
  counters: { invalidCount?: number; unknownCount?: number } = {},
): Promise<{ added: number; skipped_invalid: number; skipped_unknown: number; skipped_duplicate: number }> {
  const invalidCount = counters.invalidCount ?? 0
  const unknownCount = counters.unknownCount ?? 0
  if (subscriberIds.length === 0) {
    return { added: 0, skipped_invalid: invalidCount, skipped_unknown: unknownCount, skipped_duplicate: 0 }
  }
  const db = getDb()

  const existing = await db.select({ subscriberId: subscriberListMembers.subscriberId })
    .from(subscriberListMembers)
    .where(and(
      eq(subscriberListMembers.listId, listId),
      inArray(subscriberListMembers.subscriberId, subscriberIds),
    ))
  const existingSet = new Set(existing.map((r) => r.subscriberId))

  const toInsert = subscriberIds
    .filter((id) => !existingSet.has(id))
    .map((subscriberId) => ({
      listId,
      subscriberId,
      token: crypto.randomUUID(),
    }))

  const dupCount = subscriberIds.length - toInsert.length

  const CHUNK_SIZE = 50
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await db.insert(subscriberListMembers).values(toInsert.slice(i, i + CHUNK_SIZE))
  }

  return {
    added: toInsert.length,
    skipped_invalid: invalidCount,
    skipped_unknown: unknownCount,
    skipped_duplicate: dupCount,
  }
}

export async function removeMember(listId: number, subscriberId: number): Promise<boolean> {
  const db = getDb()
  const result = await db.delete(subscriberListMembers)
    .where(and(
      eq(subscriberListMembers.listId, listId),
      eq(subscriberListMembers.subscriberId, subscriberId),
    ))
  return (result.rowsAffected ?? 0) > 0
}

export async function removeMemberByToken(token: string): Promise<{ removed: boolean; listId: number | null; subscriberId: number | null }> {
  const db = getDb()
  const rows = await db.select({
    id: subscriberListMembers.id,
    listId: subscriberListMembers.listId,
    subscriberId: subscriberListMembers.subscriberId,
  })
    .from(subscriberListMembers)
    .where(eq(subscriberListMembers.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return { removed: false, listId: null, subscriberId: null }

  await db.delete(subscriberListMembers).where(eq(subscriberListMembers.id, row.id))
  return { removed: true, listId: row.listId, subscriberId: row.subscriberId }
}

export async function getListMembers(listId: number): Promise<SubscriberListMember[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: subscriberListMembers.id,
      listId: subscriberListMembers.listId,
      subscriberId: subscriberListMembers.subscriberId,
      email: newsletterSubscribers.email,
      firstName: newsletterSubscribers.firstName,
      status: newsletterSubscribers.status,
      token: subscriberListMembers.token,
      addedAt: subscriberListMembers.addedAt,
    })
    .from(subscriberListMembers)
    .innerJoin(newsletterSubscribers, eq(newsletterSubscribers.id, subscriberListMembers.subscriberId))
    .where(eq(subscriberListMembers.listId, listId))
    .orderBy(newsletterSubscribers.email)
  return rows.map((r) => ({
    id: r.id,
    list_id: r.listId,
    subscriber_id: r.subscriberId,
    email: r.email,
    first_name: r.firstName ?? null,
    status: r.status,
    token: r.token,
    added_at: r.addedAt,
  }))
}

/**
 * Liefert E-Mails + Tokens fuer den Newsletter-Send-Pfad. Filtert
 * 'pending' und 'blocked' Subscriber raus — nur 'active' Mitglieder
 * bekommen den Newsletter.
 *
 * `token`           = Listen-Member-Token (RFC-8058 Unsubscribe pro Liste)
 * `subscriberToken` = Stammlisten-Token (Subscription Center / Komplett-Unsub)
 */
export async function getListEmailsForSend(listId: number): Promise<{
  email: string
  token: string
  subscriberToken: string
  firstName: string | null
}[]> {
  const db = getDb()
  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      token: subscriberListMembers.token,
      subscriberToken: newsletterSubscribers.token,
      firstName: newsletterSubscribers.firstName,
    })
    .from(subscriberListMembers)
    .innerJoin(newsletterSubscribers, eq(newsletterSubscribers.id, subscriberListMembers.subscriberId))
    .where(and(
      eq(subscriberListMembers.listId, listId),
      eq(newsletterSubscribers.status, 'active'),
    ))
  return rows.map((r) => ({
    email: r.email,
    token: r.token,
    subscriberToken: r.subscriberToken,
    firstName: r.firstName ?? null,
  }))
}

/**
 * Listet alle Listen, in denen ein Subscriber aktuell Mitglied ist
 * (fuer das Subscription Center).
 */
export async function getMembershipsForSubscriber(subscriberId: number): Promise<{
  listId: number
  name: string
  description: string | null
  isPrimary: boolean
  token: string
}[]> {
  const db = getDb()
  const rows = await db.select({
    listId: subscriberLists.id,
    name: subscriberLists.name,
    description: subscriberLists.description,
    isPrimary: subscriberLists.isPrimary,
    token: subscriberListMembers.token,
  })
    .from(subscriberListMembers)
    .innerJoin(subscriberLists, eq(subscriberLists.id, subscriberListMembers.listId))
    .where(eq(subscriberListMembers.subscriberId, subscriberId))
    .orderBy(sql`${subscriberLists.isPrimary} DESC`, subscriberLists.name)
  return rows.map((r) => ({
    listId: r.listId,
    name: r.name,
    description: r.description ?? null,
    isPrimary: Number(r.isPrimary) === 1,
    token: r.token,
  }))
}
