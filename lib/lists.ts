/**
 * Newsletter-Listen — jeder Member ist eine Referenz auf einen Subscriber
 * der Stammliste (newsletter_subscribers). E-Mail wird via JOIN aufgeloest;
 * E-Mail-Aenderung am Subscriber wirkt damit automatisch in allen Listen.
 *
 * Listen werden ueber ihren stabilen `slug` von externen Anmeldeformularen
 * referenziert — kein implizites "Hauptlisten"-Konzept mehr. Jedes Form
 * uebergibt die slugs der Listen, fuer die der User sich anmeldet.
 */

import { and, eq, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import { newsletterSubscribers, subscriberLists, subscriberListMembers } from './schema'

export interface SubscriberListSummary {
  id: number
  site_id: string
  name: string
  slug: string
  description: string | null
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
  /** Wann der Subscriber sich auf der Site angemeldet hat (newsletter_subscribers.created_at). */
  subscriber_created_at: string
  confirmed_at: string | null
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags: string[]
}

// ─── Listen ────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export function isValidSlug(raw: string): boolean {
  return SLUG_REGEX.test(raw)
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'list'
}

export async function createList(siteId: string, name: string, slug: string, description?: string): Promise<number> {
  if (!isValidSlug(slug)) {
    throw new Error(`Ungültiger Slug "${slug}" — nur a-z, 0-9 und Bindestriche, maximal 64 Zeichen.`)
  }
  const db = getDb()
  const result = await db.insert(subscriberLists).values({
    siteId,
    name,
    slug,
    description: description ?? null,
  }).returning({ id: subscriberLists.id })
  return result[0].id
}

export async function renameList(id: number, name: string, slug: string, description?: string | null): Promise<void> {
  if (!isValidSlug(slug)) {
    throw new Error(`Ungültiger Slug "${slug}" — nur a-z, 0-9 und Bindestriche, maximal 64 Zeichen.`)
  }
  const db = getDb()
  await db.update(subscriberLists)
    .set({ name, slug, description: description ?? null })
    .where(eq(subscriberLists.id, id))
}

export async function deleteList(id: number): Promise<void> {
  const db = getDb()
  await db.delete(subscriberLists).where(eq(subscriberLists.id, id))
}

export async function getLists(siteId: string): Promise<SubscriberListSummary[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.slug, l.description, l.created_at,
           COUNT(m.id) as member_count
    FROM subscriber_lists l
    LEFT JOIN subscriber_list_members m ON m.list_id = l.id
    WHERE l.site_id = ${siteId}
    GROUP BY l.id
    ORDER BY l.name
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    site_id: r.site_id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    created_at: r.created_at as string,
    member_count: r.member_count as number,
  }))
}

export async function getList(id: number): Promise<SubscriberListSummary | null> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.slug, l.description, l.created_at,
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
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    created_at: r.created_at as string,
    member_count: r.member_count as number,
  }
}

/**
 * Resolved Liste-Slugs zu Liste-IDs fuer eine Site. Gibt {found, missing} zurueck —
 * Aufrufer entscheidet, was bei missing slugs passiert (Subscribe rejected, Admin
 * Auto-Create, etc.).
 */
export async function getListsBySlugs(siteId: string, slugs: string[]): Promise<{
  found: { id: number; slug: string; name: string }[]
  missing: string[]
}> {
  if (slugs.length === 0) return { found: [], missing: [] }
  const db = getDb()
  const rows = await db.select({
    id: subscriberLists.id,
    slug: subscriberLists.slug,
    name: subscriberLists.name,
  })
    .from(subscriberLists)
    .where(and(eq(subscriberLists.siteId, siteId), inArray(subscriberLists.slug, slugs)))
  const foundSlugs = new Set(rows.map((r) => r.slug))
  return {
    found: rows,
    missing: slugs.filter((s) => !foundSlugs.has(s)),
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
  // Eine Query: Members + Subscriber + Engagement (LEFT JOIN) + Tags (GROUP_CONCAT).
  // Spiegelt das Pattern aus getAllSubscribersEnriched, damit die Listen-Detailansicht
  // die gleichen Signale wie die Stammliste zeigt (Engagement-Tier, Tags, Datum).
  const rows = await db.run(sql`
    SELECT
      slm.id            AS id,
      slm.list_id       AS list_id,
      slm.subscriber_id AS subscriber_id,
      slm.token         AS token,
      slm.added_at      AS added_at,
      ns.email          AS email,
      ns.first_name     AS first_name,
      ns.status         AS status,
      ns.created_at     AS subscriber_created_at,
      ns.confirmed_at   AS confirmed_at,
      se.score          AS engagement_score,
      se.tier           AS engagement_tier,
      (
        SELECT GROUP_CONCAT(t.tag, '||')
        FROM subscriber_tags t
        WHERE t.site_id = ns.site_id AND t.subscriber_email = ns.email
      ) AS tags_concat
    FROM subscriber_list_members slm
    INNER JOIN newsletter_subscribers ns ON ns.id = slm.subscriber_id
    LEFT JOIN subscriber_engagement se
      ON se.site_id = ns.site_id AND se.subscriber_email = ns.email
    WHERE slm.list_id = ${listId}
    ORDER BY ns.email
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    list_id: r.list_id as number,
    subscriber_id: r.subscriber_id as number,
    email: r.email as string,
    first_name: (r.first_name as string | null) ?? null,
    status: r.status as 'pending' | 'active' | 'blocked',
    token: r.token as string,
    added_at: r.added_at as string,
    subscriber_created_at: r.subscriber_created_at as string,
    confirmed_at: (r.confirmed_at as string | null) ?? null,
    engagement_score: (r.engagement_score as number | null) ?? null,
    engagement_tier: (r.engagement_tier as 'active' | 'moderate' | 'dormant' | 'cold' | null) ?? null,
    tags: r.tags_concat ? (r.tags_concat as string).split('||') : [],
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
  slug: string
  description: string | null
  token: string
}[]> {
  const db = getDb()
  const rows = await db.select({
    listId: subscriberLists.id,
    name: subscriberLists.name,
    slug: subscriberLists.slug,
    description: subscriberLists.description,
    token: subscriberListMembers.token,
  })
    .from(subscriberListMembers)
    .innerJoin(subscriberLists, eq(subscriberLists.id, subscriberListMembers.listId))
    .where(eq(subscriberListMembers.subscriberId, subscriberId))
    .orderBy(subscriberLists.name)
  return rows.map((r) => ({
    listId: r.listId,
    name: r.name,
    slug: r.slug,
    description: r.description ?? null,
    token: r.token,
  }))
}
