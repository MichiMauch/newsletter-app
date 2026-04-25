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

  // Normalize slugs: strip .md/.mdx extensions for DB lookup
  const normalizedSlugs = slugs.map((s) => s.replace(/\.(md|mdx)$/, ''))
  const uniqueSlugs = [...new Set(normalizedSlugs)]

  const db = getDb()
  const rows = await db.select().from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), inArray(contentItems.slug, uniqueSlugs)))

  const map: Record<string, PostRef> = {}
  for (const item of rows) {
    const ref: PostRef = {
      slug: item.slug,
      title: item.title,
      summary: item.summary || '',
      image: item.image,
      date: item.date || '',
    }
    map[item.slug] = ref
    // Also map original slugs with extension so blocks using "post.md" find the entry
    for (const original of slugs) {
      if (original.replace(/\.(md|mdx)$/, '') === item.slug) {
        map[original] = ref
      }
    }
  }
  return map
}

export async function upsertContentItems(
  siteId: string,
  items: { slug: string; title: string; summary?: string; image?: string; date?: string; tags?: string[]; published?: boolean }[],
): Promise<number> {
  const db = getDb()
  let count = 0
  for (const item of items) {
    const tagsJson = JSON.stringify(Array.isArray(item.tags) ? item.tags : [])
    await db.insert(contentItems)
      .values({
        siteId,
        slug: item.slug,
        title: item.title,
        summary: item.summary ?? null,
        image: item.image ?? null,
        date: item.date ?? null,
        tagsJson,
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
          tagsJson: sql`excluded.tags_json`,
          published: sql`excluded.published`,
          syncedAt: sql`datetime('now')`,
        },
      })
    count++
  }
  return count
}

export async function findPostBySlugCandidates(
  siteId: string,
  slugs: string[],
): Promise<{ slug: string; tags: string[] } | null> {
  if (slugs.length === 0) return null
  const db = getDb()
  const rows = await db
    .select({ slug: contentItems.slug, tagsJson: contentItems.tagsJson })
    .from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), inArray(contentItems.slug, slugs), eq(contentItems.published, 1)))
    .limit(1)
  if (rows.length === 0) return null
  let tags: string[] = []
  try { tags = JSON.parse(rows[0].tagsJson) as string[] } catch { /* ignore */ }
  return { slug: rows[0].slug, tags }
}
