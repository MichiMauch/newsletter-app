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

import { and, eq, sql, lte, asc, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from './db'
import { scheduledSends } from './schema'
import { getOptimalSendTime } from './send-time-optimization'
import { sendMultiBlockNewsletterEmail, cancelResendEmail } from './notify'
import { getContentItemsBySlugs } from './content'
import { getSiteConfig } from './site-config'
import { getSendForRetry, markScheduledSendAsSent, updateRecipientResendId } from './newsletter'
import type { NewsletterBlock } from './newsletter-blocks'

const PUSH_HORIZON_HOURS = 1 // Slots innerhalb der nächsten Stunde direkt schieben
const PUSH_BATCH_SIZE = 50
const MAX_ATTEMPTS = 3

// ─── Enqueue ───────────────────────────────────────────────────────────

export async function enqueueScheduledSends(
  siteId: string,
  sendId: number,
  recipients: { email: string; token: string }[],
  fromUtc?: Date,
): Promise<{ enqueued: number; earliest: string; latest: string }> {
  if (recipients.length === 0) {
    return { enqueued: 0, earliest: '', latest: '' }
  }

  const db = getDb()
  const baseTime = fromUtc ?? new Date()

  const rows: typeof scheduledSends.$inferInsert[] = []
  let earliest = ''
  let latest = ''

  for (const r of recipients) {
    const opt = await getOptimalSendTime(siteId, r.email, baseTime)
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

// ─── Enqueue mit fixer Zeit (manueller geplanter Versand) ────────────

export async function enqueueUniformSchedule(
  siteId: string,
  sendId: number,
  recipients: { email: string; token: string }[],
  scheduledAtUtc: string,
): Promise<{ enqueued: number }> {
  if (recipients.length === 0) {
    return { enqueued: 0 }
  }

  const db = getDb()
  const rows: typeof scheduledSends.$inferInsert[] = recipients.map((r) => ({
    sendId,
    siteId,
    email: r.email,
    token: r.token,
    scheduledAtUtc,
    status: 'pending',
  }))

  const CHUNK_SIZE = 50
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await db.insert(scheduledSends).values(rows.slice(i, i + CHUNK_SIZE))
  }

  return { enqueued: rows.length }
}

// ─── Cancel: stoppt pending Slots + ruft Resend-Cancel für bereits gepushte
// Slots auf (deren Mail noch nicht versandt wurde) ────────────────────

export async function cancelScheduledSend(sendId: number): Promise<{
  cancelled_pending: number
  cancelled_pushed: number
  failed_pushed: number
}> {
  const db = getDb()

  // 1) Pending Slots → status='cancelled', Cron pickt sie nicht mehr auf.
  const pendingCancelled = await db.update(scheduledSends)
    .set({ status: 'cancelled' })
    .where(and(
      eq(scheduledSends.sendId, sendId),
      eq(scheduledSends.status, 'pending'),
    ))
    .returning({ id: scheduledSends.id })

  // 2) Gepushte Slots → Resend Cancel API für jede resendEmailId.
  // Resend storniert, solange die Mail noch nicht raus ist (status='scheduled').
  const pushedSlots = await db.select({ id: scheduledSends.id, resendEmailId: scheduledSends.resendEmailId })
    .from(scheduledSends)
    .where(and(
      eq(scheduledSends.sendId, sendId),
      eq(scheduledSends.status, 'pushed'),
      isNotNull(scheduledSends.resendEmailId),
    ))

  let cancelledPushed = 0
  let failedPushed = 0
  const cancelledIds: number[] = []
  const failedIds: { id: number; error: string }[] = []

  for (const slot of pushedSlots) {
    if (!slot.resendEmailId) continue
    const result = await cancelResendEmail(slot.resendEmailId)
    if (result.ok) {
      cancelledIds.push(slot.id)
      cancelledPushed++
    } else {
      failedIds.push({ id: slot.id, error: result.error ?? 'unknown' })
      failedPushed++
    }
  }

  if (cancelledIds.length > 0) {
    await db.update(scheduledSends)
      .set({ status: 'cancelled' })
      .where(inArray(scheduledSends.id, cancelledIds))
  }
  for (const f of failedIds) {
    await db.update(scheduledSends)
      .set({ lastError: `cancel failed: ${f.error}` })
      .where(eq(scheduledSends.id, f.id))
  }

  return {
    cancelled_pending: pendingCancelled.length,
    cancelled_pushed: cancelledPushed,
    failed_pushed: failedPushed,
  }
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
          sendId,
        })
        await db.update(scheduledSends)
          .set({
            status: 'pushed',
            resendEmailId: result.resendEmailId,
            pushedAt: sql`datetime('now')`,
            attempts: row.attempts + 1,
          })
          .where(eq(scheduledSends.id, row.id))
        // Auch newsletter_recipients aktualisieren — sonst zeigt die History
        // diese Empfänger als "fehlgeschlagen" an (resend_email_id war NULL).
        if (result.resendEmailId) {
          await updateRecipientResendId(sendId, row.email, result.resendEmailId)
        }
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

    // Wenn keine pending-Slots mehr für diesen Send existieren, parent als 'sent' markieren.
    const remaining = await db.select({ id: scheduledSends.id })
      .from(scheduledSends)
      .where(and(eq(scheduledSends.sendId, sendId), eq(scheduledSends.status, 'pending')))
      .limit(1)
    if (remaining.length === 0) {
      await markScheduledSendAsSent(sendId)
    }
  }

  return { pushed, failed, skipped }
}

// ─── Watchdog: parents auf 'sent' setzen, sobald Plan-Zeit vorbei ist ──

export async function flushDoneScheduledSends(): Promise<{ flushed: number }> {
  const db = getDb()
  const result = await db.run(sql`
    UPDATE newsletter_sends
    SET status = 'sent'
    WHERE status = 'scheduled'
      AND scheduled_for IS NOT NULL
      AND datetime(scheduled_for) <= datetime('now')
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_sends
        WHERE scheduled_sends.send_id = newsletter_sends.id
          AND scheduled_sends.status = 'pending'
      )
  `)
  return { flushed: Number(result.rowsAffected ?? 0) }
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
