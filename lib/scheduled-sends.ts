/**
 * Scheduled Sends — per-recipient Versand-Queue für Send-Time Optimization
 *
 * Flow:
 * 1. enqueueScheduledSends() schreibt eine Zeile pro Recipient mit individueller
 *    scheduled_at_utc (aus getOptimalSendTime).
 * 2. pushDueSendsToResend() läuft nach Enqueue + im Cron alle 15min und schiebt
 *    fällige Slots an Resend (mit nativem scheduledAt-Param). Resend hält die Mail
 *    dann bis zum Sendezeitpunkt — keine eigene Queue-Infra nötig.
 */

import { and, eq, sql, lte, asc } from 'drizzle-orm'
import { getDb } from './db'
import { scheduledSends } from './schema'
import { getOptimalSendTime } from './send-time-optimization'
import { sendMultiBlockNewsletterEmail } from './notify'
import { getContentItemsBySlugs } from './content'
import { getSiteConfig } from './site-config'
import { getSendForRetry } from './newsletter'
import type { NewsletterBlock } from './newsletter-blocks'

const PUSH_HORIZON_HOURS = 1 // Slots innerhalb der nächsten Stunde direkt schieben
const PUSH_BATCH_SIZE = 50
const MAX_ATTEMPTS = 3

// ─── Enqueue ───────────────────────────────────────────────────────────

export async function enqueueScheduledSends(
  siteId: string,
  sendId: number,
  recipients: { email: string; token: string }[],
): Promise<{ enqueued: number; earliest: string; latest: string }> {
  if (recipients.length === 0) {
    return { enqueued: 0, earliest: '', latest: '' }
  }

  const db = getDb()
  const now = new Date()

  const rows: typeof scheduledSends.$inferInsert[] = []
  let earliest = ''
  let latest = ''

  for (const r of recipients) {
    const opt = await getOptimalSendTime(siteId, r.email, now)
    rows.push({
      sendId,
      siteId,
      email: r.email,
      token: r.token,
      scheduledAtUtc: opt.scheduled_at_utc,
      status: 'pending',
    })
    if (!earliest || opt.scheduled_at_utc < earliest) earliest = opt.scheduled_at_utc
    if (!latest || opt.scheduled_at_utc > latest) latest = opt.scheduled_at_utc
  }

  // Chunked insert (gleiche Strategie wie recordNewsletterRecipientsBatch)
  const CHUNK_SIZE = 50
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await db.insert(scheduledSends).values(rows.slice(i, i + CHUNK_SIZE))
  }

  return { enqueued: rows.length, earliest, latest }
}

// ─── Picker: schiebt fällige Slots an Resend ──────────────────────────

export async function pushDueSendsToResend(): Promise<{
  pushed: number
  failed: number
  skipped: number
}> {
  const db = getDb()

  const horizon = new Date(Date.now() + PUSH_HORIZON_HOURS * 3_600_000).toISOString()

  const due = await db.select()
    .from(scheduledSends)
    .where(and(
      eq(scheduledSends.status, 'pending'),
      lte(scheduledSends.scheduledAtUtc, horizon),
    ))
    .orderBy(asc(scheduledSends.scheduledAtUtc))
    .limit(PUSH_BATCH_SIZE)

  if (due.length === 0) {
    return { pushed: 0, failed: 0, skipped: 0 }
  }

  // Gruppiere nach (site_id, send_id) → spart Site-Config + Blocks-Lookups
  const groups = new Map<string, typeof due>()
  for (const row of due) {
    const key = `${row.siteId}::${row.sendId}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  let pushed = 0
  let failed = 0
  let skipped = 0

  for (const [key, group] of groups) {
    const [siteId, sendIdStr] = key.split('::')
    const sendId = parseInt(sendIdStr, 10)

    let site
    let blocks: NewsletterBlock[]
    let subject: string
    let postsMap: Record<string, import('./newsletter-blocks').PostRef>

    try {
      const sendData = await getSendForRetry(sendId)
      if (!sendData) {
        // Send wurde gelöscht — alle Slots als failed markieren
        for (const row of group) {
          await db.update(scheduledSends)
            .set({ status: 'failed', lastError: 'send not found', attempts: row.attempts + 1 })
            .where(eq(scheduledSends.id, row.id))
          skipped++
        }
        continue
      }
      site = await getSiteConfig(siteId)
      subject = sendData.subject
      blocks = JSON.parse(sendData.blocks_json) as NewsletterBlock[]
      const slugs = collectSlugs(blocks)
      postsMap = await getContentItemsBySlugs(siteId, [...slugs])
    } catch (err) {
      console.error(`[scheduled-sends] Failed to load send ${sendId}:`, err)
      for (const row of group) {
        await db.update(scheduledSends)
          .set({
            status: 'failed',
            lastError: err instanceof Error ? err.message : 'load error',
            attempts: row.attempts + 1,
          })
          .where(eq(scheduledSends.id, row.id))
        failed++
      }
      continue
    }

    for (const row of group) {
      try {
        const result = await sendMultiBlockNewsletterEmail(site, {
          email: row.email,
          unsubscribeToken: row.token,
          subject,
          blocks,
          postsMap,
          scheduledAt: row.scheduledAtUtc,
        })
        await db.update(scheduledSends)
          .set({
            status: 'pushed',
            resendEmailId: result.resendEmailId,
            pushedAt: sql`datetime('now')`,
            attempts: row.attempts + 1,
          })
          .where(eq(scheduledSends.id, row.id))
        pushed++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        const newAttempts = row.attempts + 1
        const finalStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
        await db.update(scheduledSends)
          .set({ status: finalStatus, lastError: message, attempts: newAttempts })
          .where(eq(scheduledSends.id, row.id))
        if (finalStatus === 'failed') failed++
      }
    }
  }

  return { pushed, failed, skipped }
}

// ─── Status pro Send (für Admin-UI) ────────────────────────────────────

export async function getScheduledSendStatus(sendId: number): Promise<{
  total: number
  pending: number
  pushed: number
  failed: number
  earliest: string | null
  latest: string | null
}> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT status, COUNT(*) as count,
           MIN(scheduled_at_utc) as earliest,
           MAX(scheduled_at_utc) as latest
    FROM scheduled_sends
    WHERE send_id = ${sendId}
    GROUP BY status
  `)

  const stats = { total: 0, pending: 0, pushed: 0, failed: 0, earliest: null as string | null, latest: null as string | null }
  for (const r of rows.rows ?? []) {
    const status = r.status as string
    const count = r.count as number
    stats.total += count
    if (status === 'pending') stats.pending = count
    if (status === 'pushed') stats.pushed = count
    if (status === 'failed') stats.failed = count
    if (r.earliest && (!stats.earliest || (r.earliest as string) < stats.earliest)) stats.earliest = r.earliest as string
    if (r.latest && (!stats.latest || (r.latest as string) > stats.latest)) stats.latest = r.latest as string
  }
  return stats
}

function collectSlugs(blocks: NewsletterBlock[]): Set<string> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') slugs.add(block.slug)
    if (block.type === 'link-list') block.slugs.forEach((s) => slugs.add(s))
  }
  return slugs
}
