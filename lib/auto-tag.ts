/**
 * Auto-Tagging: derives subscriber interests from newsletter clicks.
 *
 * Flow per click:
 *  1. Parse the click URL → extract path segments as slug candidates
 *  2. Look up the matching content_item → read its tags
 *  3. Increment a click counter per (site, email, tag) in subscriber_tag_signals
 *  4. Once a tag's counter reaches the threshold, persist it to subscriber_tags
 *     and mark the signal as `applied = 1` so we don't re-apply on every click.
 */

import { and, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { subscriberTagSignals } from './schema'
import { findPostBySlugCandidates } from './content'
import { addTag, hasTag } from './tags'

const DEFAULT_THRESHOLD = 2

function getThreshold(): number {
  const raw = process.env.AUTO_TAG_CLICK_THRESHOLD
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_THRESHOLD
}

function extractSlugCandidates(url: string): string[] {
  try {
    const u = new URL(url)
    return u.pathname.split('/').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function applyClickTagging(siteId: string, email: string, url: string): Promise<{ applied: string[] }> {
  const candidates = extractSlugCandidates(url)
  if (candidates.length === 0) return { applied: [] }

  const post = await findPostBySlugCandidates(siteId, candidates)
  if (!post || post.tags.length === 0) return { applied: [] }

  const threshold = getThreshold()
  const lowerEmail = email.toLowerCase()
  const db = getDb()
  const newlyApplied: string[] = []

  for (const tag of post.tags) {
    const cleanTag = tag.trim()
    if (!cleanTag) continue

    // Upsert + increment counter
    await db
      .insert(subscriberTagSignals)
      .values({
        siteId,
        subscriberEmail: lowerEmail,
        tag: cleanTag,
        clickCount: 1,
      })
      .onConflictDoUpdate({
        target: [subscriberTagSignals.siteId, subscriberTagSignals.subscriberEmail, subscriberTagSignals.tag],
        set: {
          clickCount: sql`${subscriberTagSignals.clickCount} + 1`,
          lastSeenAt: sql`datetime('now')`,
        },
      })

    // Read current state
    const rows = await db
      .select({ count: subscriberTagSignals.clickCount, applied: subscriberTagSignals.applied })
      .from(subscriberTagSignals)
      .where(and(
        eq(subscriberTagSignals.siteId, siteId),
        eq(subscriberTagSignals.subscriberEmail, lowerEmail),
        eq(subscriberTagSignals.tag, cleanTag),
      ))
      .limit(1)

    const current = rows[0]
    if (!current) continue
    if (current.applied === 1) continue
    if (current.count < threshold) continue

    // Threshold reached — apply tag
    if (!(await hasTag(siteId, lowerEmail, cleanTag))) {
      await addTag(siteId, lowerEmail, cleanTag)
    }
    await db
      .update(subscriberTagSignals)
      .set({ applied: 1 })
      .where(and(
        eq(subscriberTagSignals.siteId, siteId),
        eq(subscriberTagSignals.subscriberEmail, lowerEmail),
        eq(subscriberTagSignals.tag, cleanTag),
      ))
    newlyApplied.push(cleanTag)
  }

  return { applied: newlyApplied }
}
