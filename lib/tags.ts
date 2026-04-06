import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import { subscriberTags } from './schema'

export async function addTag(siteId: string, email: string, tag: string): Promise<void> {
  const db = getDb()
  try {
    await db.insert(subscriberTags).values({
      siteId, subscriberEmail: email.toLowerCase(), tag,
    })
  } catch {
    // Already exists (unique constraint), ignore
  }
}

export async function removeTag(siteId: string, email: string, tag: string): Promise<void> {
  const db = getDb()
  await db.delete(subscriberTags).where(and(
    eq(subscriberTags.siteId, siteId),
    eq(subscriberTags.subscriberEmail, email.toLowerCase()),
    eq(subscriberTags.tag, tag),
  ))
}

export async function hasTag(siteId: string, email: string, tag: string): Promise<boolean> {
  const db = getDb()
  const rows = await db.select({ id: subscriberTags.id }).from(subscriberTags).where(and(
    eq(subscriberTags.siteId, siteId),
    eq(subscriberTags.subscriberEmail, email.toLowerCase()),
    eq(subscriberTags.tag, tag),
  )).limit(1)
  return rows.length > 0
}

export async function getTagsForSubscriber(siteId: string, email: string): Promise<string[]> {
  const db = getDb()
  const rows = await db.select({ tag: subscriberTags.tag }).from(subscriberTags).where(and(
    eq(subscriberTags.siteId, siteId),
    eq(subscriberTags.subscriberEmail, email.toLowerCase()),
  ))
  return rows.map((r) => r.tag)
}

export async function getAllTags(siteId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db.selectDistinct({ tag: subscriberTags.tag })
    .from(subscriberTags)
    .where(eq(subscriberTags.siteId, siteId))
    .orderBy(sql`${subscriberTags.tag} ASC`)
  return rows.map((r) => r.tag)
}
