import { eq, and, inArray, sql } from 'drizzle-orm'
import { getDb } from './db'
import { contentItems } from './schema'
import type { PostRef } from './newsletter-blocks'

export type ContentItem = typeof contentItems.$inferSelect

export async function getContentItems(siteId: string): Promise<ContentItem[]> {
  const db = getDb()
  return db.select().from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), eq(contentItems.published, 1)))
    .orderBy(sql`${contentItems.date} DESC`)
}

export async function getContentItem(siteId: string, slug: string): Promise<ContentItem | null> {
  const db = getDb()
  const rows = await db.select().from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), eq(contentItems.slug, slug)))
    .limit(1)
  return rows[0] ?? null
}

export async function getContentItemsBySlugs(siteId: string, slugs: string[]): Promise<Record<string, PostRef>> {
  if (slugs.length === 0) return {}
  const db = getDb()
  const rows = await db.select().from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), inArray(contentItems.slug, slugs)))

  const map: Record<string, PostRef> = {}
  for (const item of rows) {
    map[item.slug] = {
      slug: item.slug,
      title: item.title,
      summary: item.summary || '',
      image: item.image,
      date: item.date || '',
    }
  }
  return map
}

export async function upsertContentItems(
  siteId: string,
  items: { slug: string; title: string; summary?: string; image?: string; date?: string; published?: boolean }[],
): Promise<number> {
  const db = getDb()
  let count = 0
  for (const item of items) {
    await db.insert(contentItems)
      .values({
        siteId,
        slug: item.slug,
        title: item.title,
        summary: item.summary ?? null,
        image: item.image ?? null,
        date: item.date ?? null,
        published: item.published !== false ? 1 : 0,
        syncedAt: sql`datetime('now')`,
      })
      .onConflictDoUpdate({
        target: [contentItems.siteId, contentItems.slug],
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          image: sql`excluded.image`,
          date: sql`excluded.date`,
          published: sql`excluded.published`,
          syncedAt: sql`datetime('now')`,
        },
      })
    count++
  }
  return count
}
