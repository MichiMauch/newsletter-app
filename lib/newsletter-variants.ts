/**
 * A/B test variants for newsletter sends.
 *
 * A "send" with variants behaves like any other send (one row in
 * newsletter_sends), but each recipient is bucketed into a labelled variant
 * with its own subject line. Per-variant counters live in
 * newsletter_send_variants and are bumped from the Resend webhook handler.
 */

import { and, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { newsletterSendVariants } from './schema'

export interface VariantSpec {
  label: string
  subject: string
}

export interface VariantStats extends VariantSpec {
  recipient_count: number
  delivered_count: number
  clicked_count: number
  bounced_count: number
  complained_count: number
}

const MAX_VARIANTS = 5
const LABEL_RE = /^[A-Za-z0-9 _-]{1,16}$/

export function parseVariantsInput(raw: unknown): VariantSpec[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length < 2 || raw.length > MAX_VARIANTS) return null

  const seen = new Set<string>()
  const out: VariantSpec[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const e = entry as { label?: unknown; subject?: unknown }
    if (typeof e.label !== 'string' || !LABEL_RE.test(e.label)) return null
    if (typeof e.subject !== 'string' || e.subject.trim().length === 0 || e.subject.length > 200) return null
    if (seen.has(e.label)) return null
    seen.add(e.label)
    out.push({ label: e.label, subject: e.subject.trim() })
  }
  return out
}

/**
 * Deterministic, evenly-sized assignment so two A/B-tested sends with the same
 * audience would split identically — useful for re-running diagnostics. Sorted
 * by email + round-robin keeps buckets balanced regardless of audience size.
 */
export function assignVariants<T extends { email: string }>(
  recipients: T[],
  variants: VariantSpec[],
): Array<T & { variant: VariantSpec }> {
  if (variants.length === 0) return recipients.map((r) => ({ ...r, variant: { label: '', subject: '' } }))
  const sorted = [...recipients].sort((a, b) => a.email.localeCompare(b.email))
  return sorted.map((r, i) => ({ ...r, variant: variants[i % variants.length] }))
}

export async function recordSendVariants(
  sendId: number,
  variants: Array<VariantSpec & { recipient_count: number }>,
): Promise<void> {
  if (variants.length === 0) return
  const db = getDb()
  await db.insert(newsletterSendVariants).values(
    variants.map((v) => ({
      sendId,
      label: v.label,
      subject: v.subject,
      recipientCount: v.recipient_count,
    })),
  )
}

export async function getVariantsForSend(sendId: number): Promise<VariantStats[]> {
  const db = getDb()
  const rows = await db.select()
    .from(newsletterSendVariants)
    .where(eq(newsletterSendVariants.sendId, sendId))
    .orderBy(newsletterSendVariants.label)
  return rows.map((r) => ({
    label: r.label,
    subject: r.subject,
    recipient_count: r.recipientCount,
    delivered_count: r.deliveredCount,
    clicked_count: r.clickedCount,
    bounced_count: r.bouncedCount,
    complained_count: r.complainedCount,
  }))
}

export async function incrementVariantCounter(
  sendId: number,
  label: string,
  field: 'delivered' | 'clicked' | 'bounced' | 'complained',
): Promise<void> {
  const db = getDb()
  const column = {
    delivered: newsletterSendVariants.deliveredCount,
    clicked: newsletterSendVariants.clickedCount,
    bounced: newsletterSendVariants.bouncedCount,
    complained: newsletterSendVariants.complainedCount,
  }[field]
  await db.update(newsletterSendVariants)
    .set({ [field === 'delivered' ? 'deliveredCount' : field === 'clicked' ? 'clickedCount' : field === 'bounced' ? 'bouncedCount' : 'complainedCount']: sql`${column} + 1` })
    .where(and(eq(newsletterSendVariants.sendId, sendId), eq(newsletterSendVariants.label, label)))
}
