import { eq, and, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import {
  newsletterSubscribers,
  subscriberLists,
  subscriberListMembers,
  subscriberTagSignals,
} from './schema'

export type Subscriber = typeof newsletterSubscribers.$inferSelect

export interface SubscriberListMembershipSummary {
  id: number
  name: string
  slug: string
}

export interface SubscriberEnriched extends Subscriber {
  // Engagement und Tags lebten urspruenglich in dieser Sicht — nach dem
  // Subscription-Center-Refactor zeigt die Stammlisten-UI nur noch Identitaet
  // + Listen-Mitgliedschaften. Die Felder bleiben optional fuer Aufrufer, die
  // noch das alte Schema erwarten; geliefert werden sie hier nicht mehr.
  engagement_score?: number | null
  engagement_tier?: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags?: string[]
  // Listen, in denen der Subscriber aktuell Mitglied ist (cross-list view).
  lists: SubscriberListMembershipSummary[]
}

export interface ComplianceContext {
  ip?: string | null
  userAgent?: string | null
}

export const SUBSCRIBER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
} as const

export type SubscriberStatus = (typeof SUBSCRIBER_STATUS)[keyof typeof SUBSCRIBER_STATUS]

export interface CreateSubscriberOptions {
  /** Listen, in die der Subscriber direkt eingetragen wird. Default = Hauptliste der Site. */
  listIds?: number[]
}

export async function createSubscriber(
  siteId: string,
  email: string,
  ctx?: ComplianceContext,
  opts: CreateSubscriberOptions = {},
): Promise<{ token: string; alreadyConfirmed: boolean; subscriberId: number }> {
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

  let subscriberId: number
  let resultToken: string
  let alreadyConfirmed = false

  if (existing.length > 0) {
    subscriberId = existing[0].id
    const { status, token: existingToken } = existing[0]

    if (status === 'active') {
      resultToken = existingToken
      alreadyConfirmed = true
    } else if (status === 'blocked') {
      // Re-subscribe nach explizitem Komplett-Abmelden / Bounce: Opt-in-Trail
      // zuruecksetzen. Das alte IP/UA war ein anderer Lifecycle.
      await db.update(newsletterSubscribers)
        .set({
          status: 'pending',
          token,
          blockedAt: null,
          subscribedIp,
          subscribedUserAgent,
          confirmedAt: null,
          confirmedIp: null,
          confirmedUserAgent: null,
        })
        .where(eq(newsletterSubscribers.id, subscriberId))
      resultToken = token
    } else {
      // Pending: Token regenerieren + Consent-Trail auffrischen.
      await db.update(newsletterSubscribers)
        .set({ token, subscribedIp, subscribedUserAgent })
        .where(eq(newsletterSubscribers.id, subscriberId))
      resultToken = token
    }
  } else {
    const inserted = await db.insert(newsletterSubscribers).values({
      siteId,
      email,
      status: 'pending',
      token,
      subscribedIp,
      subscribedUserAgent,
    }).returning({ id: newsletterSubscribers.id })
    subscriberId = inserted[0].id
    resultToken = token
  }

  // Mitgliedschaften setzen — wenn keine listIds uebergeben wurden, wird der
  // Subscriber NICHT in eine Liste eingetragen (kein implizites Default mehr).
  // Aufrufer muessen explizit listIds resolven, bevor sie createSubscriber rufen.
  if (opts.listIds && opts.listIds.length > 0) {
    await addSubscriberToLists(subscriberId, siteId, opts.listIds)
  }

  return { token: resultToken, alreadyConfirmed, subscriberId }
}

/**
 * Traegt einen Subscriber idempotent in mehrere Listen ein. Existierende
 * Mitgliedschaften bleiben unveraendert (gleicher Token).
 * Validiert, dass alle listIds zur siteId gehoeren.
 */
export async function addSubscriberToLists(
  subscriberId: number,
  siteId: string,
  listIds: number[],
): Promise<void> {
  if (listIds.length === 0) return
  const db = getDb()

  const valid = await db.select({ id: subscriberLists.id })
    .from(subscriberLists)
    .where(and(eq(subscriberLists.siteId, siteId), inArray(subscriberLists.id, listIds)))
  const validIds = new Set(valid.map((r) => r.id))

  const existing = await db.select({ listId: subscriberListMembers.listId })
    .from(subscriberListMembers)
    .where(and(
      eq(subscriberListMembers.subscriberId, subscriberId),
      inArray(subscriberListMembers.listId, listIds),
    ))
  const existingSet = new Set(existing.map((r) => r.listId))

  const toInsert = [...validIds]
    .filter((id) => !existingSet.has(id))
    .map((listId) => ({
      listId,
      subscriberId,
      token: crypto.randomUUID(),
    }))
  if (toInsert.length === 0) return
  await db.insert(subscriberListMembers).values(toInsert)
}

export async function confirmSubscriber(token: string, ctx?: ComplianceContext): Promise<boolean> {
  const db = getDb()
  const result = await db.update(newsletterSubscribers)
    .set({
      status: 'active',
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
      status: 'active',
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

/**
 * "Komplett abmelden": Subscriber wird blockiert UND alle Mitgliedschaften
 * werden geloescht. Verwendet fuer den expliziten User-Wunsch (Master-Token
 * im Unsubscribe-Flow oder "Komplett abmelden" im Subscription Center).
 * Webhooks (Bounce/Complaint) benutzen blockSubscriberById ohne Membership-Drop.
 */
export async function blockSubscriberCompletely(token: string): Promise<boolean> {
  const db = getDb()
  const rows = await db.select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.token, token))
    .limit(1)
  const sub = rows[0]
  if (!sub) return false
  await db.transaction(async (tx) => {
    await tx.update(newsletterSubscribers)
      .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
      .where(eq(newsletterSubscribers.id, sub.id))
    await tx.delete(subscriberListMembers)
      .where(eq(subscriberListMembers.subscriberId, sub.id))
  })
  return true
}

/**
 * Versorgt einen Subscriber nur status-seitig mit 'blocked' (z.B. Bounce-Pfad).
 * Mitgliedschaften bleiben unveraendert, damit Reaktivierung alles zurueckbringt.
 */
export async function blockSubscriberById(id: number): Promise<void> {
  const db = getDb()
  await db.update(newsletterSubscribers)
    .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
    .where(eq(newsletterSubscribers.id, id))
}

/**
 * @deprecated Use blockSubscriberCompletely (klare Semantik) — Alias bleibt
 * fuer Aufrufer, die die alte unsubscribe-Bezeichnung verwenden.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  return blockSubscriberCompletely(token)
}

export async function getAllSubscribers(siteId: string): Promise<Subscriber[]> {
  const db = getDb()
  return db.select().from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.siteId, siteId))
    .orderBy(sql`${newsletterSubscribers.createdAt} DESC`)
}

export async function getAllSubscribersEnriched(siteId: string): Promise<SubscriberEnriched[]> {
  const db = getDb()
  // Stammlisten-Sicht zeigt Identitaet + Listen-Mitgliedschaften (Cross-List).
  // Engagement und Tags leben in der ListsTab-Detailsicht und im Drawer, daher
  // hier kein JOIN mehr darauf. lists_concat speist die "In Listen"-Spalte —
  // Format pro Eintrag: "<id>:<slug>:<name>", getrennt mit "||". Slug enthaelt
  // garantiert kein ":" (Slug-Validation), Name kann ":" enthalten — daher
  // wird beim Parsen der Name als letztes Feld via split-with-limit
  // zusammengefuegt.
  const rows = await db.run(sql`
    SELECT
      s.id, s.site_id, s.email, s.status, s.token, s.created_at, s.confirmed_at, s.blocked_at,
      s.subscribed_ip, s.subscribed_user_agent, s.confirmed_ip, s.confirmed_user_agent,
      s.first_name,
      (
        SELECT GROUP_CONCAT(sl.id || ':' || sl.slug || ':' || sl.name, '||')
        FROM subscriber_list_members slm
        JOIN subscriber_lists sl ON sl.id = slm.list_id
        WHERE slm.subscriber_id = s.id
        ORDER BY sl.name
      ) AS lists_concat
    FROM newsletter_subscribers s
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
    blockedAt: (r.blocked_at as string | null) ?? null,
    subscribedIp: (r.subscribed_ip as string | null) ?? null,
    subscribedUserAgent: (r.subscribed_user_agent as string | null) ?? null,
    confirmedIp: (r.confirmed_ip as string | null) ?? null,
    confirmedUserAgent: (r.confirmed_user_agent as string | null) ?? null,
    firstName: (r.first_name as string | null) ?? null,
    lists: parseListsConcat(r.lists_concat as string | null),
  }))
}

function parseListsConcat(raw: string | null): SubscriberListMembershipSummary[] {
  if (!raw) return []
  const out: SubscriberListMembershipSummary[] = []
  for (const entry of raw.split('||')) {
    // Format: "<id>:<slug>:<name>" — Slug ist garantiert ohne ":" (Validation),
    // Name kann ":" enthalten, daher splitWithLimit-Style.
    const firstColon = entry.indexOf(':')
    if (firstColon < 0) continue
    const secondColon = entry.indexOf(':', firstColon + 1)
    if (secondColon < 0) continue
    const id = Number(entry.slice(0, firstColon))
    const slug = entry.slice(firstColon + 1, secondColon)
    const name = entry.slice(secondColon + 1)
    if (!Number.isFinite(id) || !slug || !name) continue
    out.push({ id, name, slug })
  }
  // SQLite GROUP_CONCAT garantiert keine Reihenfolge — alphabetisch sortieren.
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export async function unsubscribeById(id: number): Promise<void> {
  // Admin-Pfad "Subscriber komplett abmelden": Status blockiert UND
  // Mitgliedschaften droppen, damit die UI konsistent zum User-initiierten
  // Komplett-Abmelden bleibt.
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.update(newsletterSubscribers)
      .set({ status: 'blocked', blockedAt: sql`datetime('now')` })
      .where(eq(newsletterSubscribers.id, id))
    await tx.delete(subscriberListMembers)
      .where(eq(subscriberListMembers.subscriberId, id))
  })
}

export async function getSubscriberByToken(token: string): Promise<{ id: number; email: string; token: string; site_id: string } | null> {
  const db = getDb()
  const rows = await db.select({
    id: newsletterSubscribers.id,
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
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email), eq(newsletterSubscribers.status, 'active')))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Alle versandberechtigten Subscriber (Status 'active') einer Site.
 * Wird nur fuer Tag-Filter-/Automation-Pfade gebraucht — der regulaere Versand
 * laeuft ueber Listen (siehe lib/lists.ts:getListEmailsForSend).
 */
export async function getActiveSubscribers(siteId: string): Promise<{ email: string; token: string }[]> {
  const db = getDb()
  return db.select({ email: newsletterSubscribers.email, token: newsletterSubscribers.token })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.status, 'active')))
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
      eq(newsletterSubscribers.status, 'active'),
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

// Batch-loads (firstName, master-token) — der Token speist den Magic-Link
// auf das Subscription Center im Mail-Footer (STO/Scheduled-Sends-Pfad,
// wo die scheduled_sends-Zeile nur den Listen-Member-Token kennt).
export async function getSubscriberContextByEmails(
  siteId: string,
  emails: string[],
): Promise<Map<string, { firstName: string | null; token: string }>> {
  if (emails.length === 0) return new Map()
  const db = getDb()
  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      firstName: newsletterSubscribers.firstName,
      token: newsletterSubscribers.token,
    })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      inArray(newsletterSubscribers.email, emails),
    ))
  return new Map(rows.map((r) => [r.email, { firstName: r.firstName ?? null, token: r.token }]))
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
