import { and, eq, inArray, sql, count, countDistinct } from 'drizzle-orm'
import { getDb } from './db'
import { contentItems, newsletterSends, newsletterSubscribers, subscriberTagSignals } from './schema'
import type { NewsletterBlock } from './newsletter-blocks'

export type EngagementBucketLevel = 'high' | 'medium' | 'cold'

export interface EngagementBucket {
  level: EngagementBucketLevel
  count: number
  avgSignal: number
}

export interface EngagementByTag {
  tag: string
  interestedCount: number
}

export interface SimilarSend {
  id: number
  subject: string
  sentAt: string
  clickRate: number
  sharedTagCount: number
}

export interface SimilarSendsStats {
  sampleSize: number
  avgClickRate: number
  examples: SimilarSend[]
}

export interface EngagementPrediction {
  totalConfirmed: number
  tags: string[]
  buckets: EngagementBucket[]
  byTag: EngagementByTag[]
  similarSends: SimilarSendsStats
}

const HIGH_THRESHOLD = 5
const MEDIUM_THRESHOLD = 1

const EMPTY_SIMILAR: SimilarSendsStats = { sampleSize: 0, avgClickRate: 0, examples: [] }

function emptyResult(totalConfirmed: number, tags: string[]): EngagementPrediction {
  return {
    totalConfirmed,
    tags,
    buckets: [
      { level: 'high', count: 0, avgSignal: 0 },
      { level: 'medium', count: 0, avgSignal: 0 },
      { level: 'cold', count: totalConfirmed, avgSignal: 0 },
    ],
    byTag: [],
    similarSends: EMPTY_SIMILAR,
  }
}

async function getTagsForSlugs(siteId: string, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return []
  const normalized = [...new Set(slugs.map((s) => s.replace(/\.(md|mdx)$/, '')))]
  const db = getDb()
  const rows = await db
    .select({ tagsJson: contentItems.tagsJson })
    .from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), inArray(contentItems.slug, normalized)))
  const all = new Set<string>()
  for (const r of rows) {
    try {
      const parsed: unknown = JSON.parse(r.tagsJson)
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (typeof t === 'string' && t.trim()) all.add(t.trim())
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return [...all]
}

export async function predictEngagement(
  siteId: string,
  input: { slugs?: string[]; tags?: string[] },
): Promise<EngagementPrediction> {
  const db = getDb()

  const totalRow = await db
    .select({ c: count() })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      eq(newsletterSubscribers.status, 'confirmed'),
    ))
  const totalConfirmed = totalRow[0]?.c ?? 0

  const directTags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean)
  const fromSlugs = await getTagsForSlugs(siteId, input.slugs ?? [])
  const tags = [...new Set([...directTags, ...fromSlugs])]

  if (tags.length === 0 || totalConfirmed === 0) {
    return emptyResult(totalConfirmed, tags)
  }

  const sumExpr = sql<number>`SUM(${subscriberTagSignals.clickCount})`
  const rows = await db
    .select({
      email: subscriberTagSignals.subscriberEmail,
      total: sumExpr,
    })
    .from(subscriberTagSignals)
    .innerJoin(
      newsletterSubscribers,
      and(
        eq(newsletterSubscribers.siteId, subscriberTagSignals.siteId),
        eq(newsletterSubscribers.email, subscriberTagSignals.subscriberEmail),
        eq(newsletterSubscribers.status, 'confirmed'),
      ),
    )
    .where(and(
      eq(subscriberTagSignals.siteId, siteId),
      inArray(subscriberTagSignals.tag, tags),
    ))
    .groupBy(subscriberTagSignals.subscriberEmail)

  let highCount = 0
  let highSum = 0
  let medCount = 0
  let medSum = 0
  for (const r of rows) {
    const total = Number(r.total ?? 0)
    if (total >= HIGH_THRESHOLD) {
      highCount++
      highSum += total
    } else if (total >= MEDIUM_THRESHOLD) {
      medCount++
      medSum += total
    }
  }
  const coldCount = Math.max(0, totalConfirmed - highCount - medCount)

  const tagRows = await db
    .select({
      tag: subscriberTagSignals.tag,
      c: countDistinct(subscriberTagSignals.subscriberEmail),
    })
    .from(subscriberTagSignals)
    .innerJoin(
      newsletterSubscribers,
      and(
        eq(newsletterSubscribers.siteId, subscriberTagSignals.siteId),
        eq(newsletterSubscribers.email, subscriberTagSignals.subscriberEmail),
        eq(newsletterSubscribers.status, 'confirmed'),
      ),
    )
    .where(and(
      eq(subscriberTagSignals.siteId, siteId),
      inArray(subscriberTagSignals.tag, tags),
      sql`${subscriberTagSignals.clickCount} >= ${MEDIUM_THRESHOLD}`,
    ))
    .groupBy(subscriberTagSignals.tag)

  const byTag: EngagementByTag[] = tags.map((tag) => {
    const found = tagRows.find((r) => r.tag === tag)
    return { tag, interestedCount: found ? Number(found.c) : 0 }
  })

  const similarSends = await getSimilarSendsStats(siteId, tags)

  return {
    totalConfirmed,
    tags,
    buckets: [
      { level: 'high', count: highCount, avgSignal: highCount ? highSum / highCount : 0 },
      { level: 'medium', count: medCount, avgSignal: medCount ? medSum / medCount : 0 },
      { level: 'cold', count: coldCount, avgSignal: 0 },
    ],
    byTag,
    similarSends,
  }
}

const SIMILAR_SENDS_MAX_LOOKBACK = 50
const SIMILAR_SENDS_MAX_EXAMPLES = 5

function extractSlugsFromBlocks(blocks: NewsletterBlock[]): string[] {
  const slugs: string[] = []
  for (const b of blocks) {
    if (b.type === 'hero' && b.slug) slugs.push(b.slug)
    if (b.type === 'link-list' && Array.isArray(b.slugs)) slugs.push(...b.slugs)
  }
  return slugs
}

function parseBlocksJson(raw: string | null): NewsletterBlock[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NewsletterBlock[]) : []
  } catch {
    return []
  }
}

export async function getSimilarSendsStats(
  siteId: string,
  currentTags: string[],
): Promise<SimilarSendsStats> {
  if (currentTags.length === 0) return EMPTY_SIMILAR
  const currentTagSet = new Set(currentTags)

  const db = getDb()
  const sends = await db
    .select({
      id: newsletterSends.id,
      subject: newsletterSends.subject,
      sentAt: newsletterSends.sentAt,
      blocksJson: newsletterSends.blocksJson,
      recipientCount: newsletterSends.recipientCount,
      clickedCount: newsletterSends.clickedCount,
    })
    .from(newsletterSends)
    .where(and(
      eq(newsletterSends.siteId, siteId),
      eq(newsletterSends.status, 'sent'),
      sql`${newsletterSends.recipientCount} > 0`,
    ))
    .orderBy(sql`${newsletterSends.sentAt} DESC`)
    .limit(SIMILAR_SENDS_MAX_LOOKBACK)

  if (sends.length === 0) return EMPTY_SIMILAR

  const allSlugs = new Set<string>()
  const sendSlugs = new Map<number, string[]>()
  for (const s of sends) {
    const blocks = parseBlocksJson(s.blocksJson)
    const slugs = [...new Set(extractSlugsFromBlocks(blocks).map((x) => x.replace(/\.(md|mdx)$/, '')))]
    sendSlugs.set(s.id, slugs)
    for (const sl of slugs) allSlugs.add(sl)
  }

  if (allSlugs.size === 0) return EMPTY_SIMILAR

  const tagRows = await db
    .select({ slug: contentItems.slug, tagsJson: contentItems.tagsJson })
    .from(contentItems)
    .where(and(eq(contentItems.siteId, siteId), inArray(contentItems.slug, [...allSlugs])))

  const tagsBySlug = new Map<string, string[]>()
  for (const row of tagRows) {
    try {
      const parsed: unknown = JSON.parse(row.tagsJson)
      if (Array.isArray(parsed)) {
        tagsBySlug.set(row.slug, parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0))
      }
    } catch {
      // ignore
    }
  }

  const matches: SimilarSend[] = []
  for (const s of sends) {
    const slugs = sendSlugs.get(s.id) ?? []
    const sendTags = new Set<string>()
    for (const sl of slugs) {
      const t = tagsBySlug.get(sl)
      if (t) for (const tag of t) sendTags.add(tag)
    }
    let shared = 0
    for (const tag of sendTags) if (currentTagSet.has(tag)) shared++
    if (shared === 0) continue

    const recipients = s.recipientCount ?? 0
    const clicks = s.clickedCount ?? 0
    const clickRate = recipients > 0 ? (clicks / recipients) * 100 : 0
    matches.push({
      id: s.id,
      subject: s.subject,
      sentAt: s.sentAt,
      clickRate: Math.round(clickRate * 10) / 10,
      sharedTagCount: shared,
    })
  }

  if (matches.length === 0) return EMPTY_SIMILAR

  const avg = matches.reduce((sum, m) => sum + m.clickRate, 0) / matches.length
  const examples = [...matches]
    .sort((a, b) => b.sharedTagCount - a.sharedTagCount || b.sentAt.localeCompare(a.sentAt))
    .slice(0, SIMILAR_SENDS_MAX_EXAMPLES)

  return {
    sampleSize: matches.length,
    avgClickRate: Math.round(avg * 10) / 10,
    examples,
  }
}
