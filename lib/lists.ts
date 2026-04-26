/**
 * Manuelle Empfänger-Listen — beliebige E-Mail-Adressen, unabhängig von
 * newsletter_subscribers. Jeder Member bekommt einen eigenen Token, damit
 * der List-Unsubscribe-Link funktioniert.
 */

import { and, eq, sql, inArray } from 'drizzle-orm'
import { getDb } from './db'
import { subscriberLists, subscriberListMembers } from './schema'

export interface SubscriberListSummary {
  id: number
  site_id: string
  name: string
  description: string | null
  created_at: string
  member_count: number
}

export interface SubscriberListMember {
  id: number
  list_id: number
  email: string
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

export async function getLists(siteId: string): Promise<SubscriberListSummary[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.description, l.created_at,
           COUNT(m.id) as member_count
    FROM subscriber_lists l
    LEFT JOIN subscriber_list_members m ON m.list_id = l.id
    WHERE l.site_id = ${siteId}
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number,
    site_id: r.site_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    created_at: r.created_at as string,
    member_count: r.member_count as number,
  }))
}

export async function getList(id: number): Promise<SubscriberListSummary | null> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT l.id, l.site_id, l.name, l.description, l.created_at,
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

export async function addMembers(listId: number, emails: string[]): Promise<{
  added: number
  skipped_invalid: number
  skipped_duplicate: number
}> {
  if (emails.length === 0) return { added: 0, skipped_invalid: 0, skipped_duplicate: 0 }

  const db = getDb()

  const valid: string[] = []
  let invalidCount = 0
  for (const raw of emails) {
    const normalized = normalizeEmail(raw)
    if (normalized) valid.push(normalized)
    else invalidCount++
  }

  if (valid.length === 0) {
    return { added: 0, skipped_invalid: invalidCount, skipped_duplicate: 0 }
  }

  const existing = await db.select({ email: subscriberListMembers.email })
    .from(subscriberListMembers)
    .where(and(
      eq(subscriberListMembers.listId, listId),
      inArray(subscriberListMembers.email, valid),
    ))
  const existingSet = new Set(existing.map((r) => r.email))

  const toInsert: typeof subscriberListMembers.$inferInsert[] = []
  let dupCount = 0
  for (const email of valid) {
    if (existingSet.has(email)) {
      dupCount++
      continue
    }
    toInsert.push({
      listId,
      email,
      token: crypto.randomUUID(),
    })
  }

  const CHUNK_SIZE = 50
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await db.insert(subscriberListMembers).values(toInsert.slice(i, i + CHUNK_SIZE))
  }

  return {
    added: toInsert.length,
    skipped_invalid: invalidCount,
    skipped_duplicate: dupCount,
  }
}

export async function removeMember(listId: number, email: string): Promise<boolean> {
  const db = getDb()
  const result = await db.delete(subscriberListMembers)
    .where(and(
      eq(subscriberListMembers.listId, listId),
      eq(subscriberListMembers.email, email),
    ))
  return (result.rowsAffected ?? 0) > 0
}

export async function removeMemberByToken(token: string): Promise<{ removed: boolean; listId: number | null }> {
  const db = getDb()
  const rows = await db.select({ id: subscriberListMembers.id, listId: subscriberListMembers.listId })
    .from(subscriberListMembers)
    .where(eq(subscriberListMembers.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return { removed: false, listId: null }

  await db.delete(subscriberListMembers).where(eq(subscriberListMembers.id, row.id))
  return { removed: true, listId: row.listId }
}

export async function getListMembers(listId: number): Promise<SubscriberListMember[]> {
  const db = getDb()
  const rows = await db.select().from(subscriberListMembers)
    .where(eq(subscriberListMembers.listId, listId))
    .orderBy(subscriberListMembers.email)
  return rows.map((r) => ({
    id: r.id,
    list_id: r.listId,
    email: r.email,
    token: r.token,
    added_at: r.addedAt,
  }))
}

/** Liefert E-Mails + Tokens für den Newsletter-Send-Pfad. */
export async function getListEmailsForSend(listId: number): Promise<{ email: string; token: string }[]> {
  const db = getDb()
  const rows = await db.select({
    email: subscriberListMembers.email,
    token: subscriberListMembers.token,
  }).from(subscriberListMembers)
    .where(eq(subscriberListMembers.listId, listId))
  return rows
}
