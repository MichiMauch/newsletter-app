import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { newsletterDrafts } from './schema'
import type { NewsletterBlock } from './newsletter-blocks'

export type DraftStatus = 'draft' | 'ready_to_send' | 'sent' | 'archived'

export type NewsletterDraftRow = typeof newsletterDrafts.$inferSelect

export interface NewsletterDraft {
  id: string
  siteId: string
  title: string
  subject: string
  preheader: string | null
  abTestEnabled: boolean
  subjectVariantB: string | null
  blocks: NewsletterBlock[]
  status: DraftStatus
  lastTestedAt: string | null
  lastTestedTo: string | null
  finalizedAt: string | null
  sentAt: string | null
  sentSendId: number | null
  createdAt: string
  updatedAt: string
}

export class DraftNotFoundError extends Error {
  constructor(id: string) {
    super(`Draft ${id} not found`)
    this.name = 'DraftNotFoundError'
  }
}

export class DraftStatusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DraftStatusError'
  }
}

function parseBlocks(json: string): NewsletterBlock[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as NewsletterBlock[]) : []
  } catch {
    return []
  }
}

function rowToDraft(row: NewsletterDraftRow): NewsletterDraft {
  return {
    id: row.id,
    siteId: row.siteId,
    title: row.title,
    subject: row.subject,
    preheader: row.preheader,
    abTestEnabled: row.abTestEnabled === 1,
    subjectVariantB: row.subjectVariantB,
    blocks: parseBlocks(row.blocksJson),
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastTestedTo: row.lastTestedTo,
    finalizedAt: row.finalizedAt,
    sentAt: row.sentAt,
    sentSendId: row.sentSendId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export interface CreateDraftInput {
  siteId: string
  title?: string
  subject?: string
  preheader?: string | null
  abTestEnabled?: boolean
  subjectVariantB?: string | null
  blocks?: NewsletterBlock[]
}

export async function createDraft(input: CreateDraftInput): Promise<NewsletterDraft> {
  const id = crypto.randomUUID()
  const [row] = await getDb()
    .insert(newsletterDrafts)
    .values({
      id,
      siteId: input.siteId,
      title: input.title ?? '',
      subject: input.subject ?? '',
      preheader: input.preheader ?? null,
      abTestEnabled: input.abTestEnabled ? 1 : 0,
      subjectVariantB: input.subjectVariantB ?? null,
      blocksJson: JSON.stringify(input.blocks ?? []),
    })
    .returning()
  return rowToDraft(row)
}

export interface ListDraftsOptions {
  siteId: string
  status?: DraftStatus | DraftStatus[]
}

export async function listDrafts(opts: ListDraftsOptions): Promise<NewsletterDraft[]> {
  const conditions = [eq(newsletterDrafts.siteId, opts.siteId)]
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
    if (statuses.length === 1) {
      conditions.push(eq(newsletterDrafts.status, statuses[0]))
    } else if (statuses.length > 1) {
      conditions.push(sql`${newsletterDrafts.status} IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`)
    }
  }
  const rows = await getDb()
    .select()
    .from(newsletterDrafts)
    .where(and(...conditions))
    .orderBy(desc(newsletterDrafts.updatedAt))
  return rows.map(rowToDraft)
}

export async function getDraft(id: string, siteId?: string): Promise<NewsletterDraft | null> {
  const conditions = [eq(newsletterDrafts.id, id)]
  if (siteId) conditions.push(eq(newsletterDrafts.siteId, siteId))
  const [row] = await getDb()
    .select()
    .from(newsletterDrafts)
    .where(and(...conditions))
    .limit(1)
  return row ? rowToDraft(row) : null
}

export interface UpdateDraftPatch {
  title?: string
  subject?: string
  preheader?: string | null
  abTestEnabled?: boolean
  subjectVariantB?: string | null
  blocks?: NewsletterBlock[]
}

export async function updateDraft(
  id: string,
  patch: UpdateDraftPatch,
  siteId?: string,
): Promise<NewsletterDraft> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  if (existing.status === 'sent' || existing.status === 'archived') {
    throw new DraftStatusError(`Cannot edit draft in status '${existing.status}'`)
  }

  const [row] = await getDb()
    .update(newsletterDrafts)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.subject !== undefined && { subject: patch.subject }),
      ...(patch.preheader !== undefined && { preheader: patch.preheader }),
      ...(patch.abTestEnabled !== undefined && { abTestEnabled: patch.abTestEnabled ? 1 : 0 }),
      ...(patch.subjectVariantB !== undefined && { subjectVariantB: patch.subjectVariantB }),
      ...(patch.blocks !== undefined && { blocksJson: JSON.stringify(patch.blocks) }),
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(newsletterDrafts.id, id))
    .returning()
  return rowToDraft(row)
}

export async function deleteDraft(id: string, siteId?: string): Promise<void> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  await getDb().delete(newsletterDrafts).where(eq(newsletterDrafts.id, id))
}

export async function finalizeDraft(id: string, siteId?: string): Promise<NewsletterDraft> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  if (existing.status !== 'draft') {
    throw new DraftStatusError(`Cannot finalize draft in status '${existing.status}'`)
  }
  if (!existing.subject.trim()) {
    throw new DraftStatusError('Cannot finalize draft without a subject')
  }
  if (existing.blocks.length === 0) {
    throw new DraftStatusError('Cannot finalize draft without any blocks')
  }
  const [row] = await getDb()
    .update(newsletterDrafts)
    .set({
      status: 'ready_to_send',
      finalizedAt: sql`(datetime('now'))`,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(newsletterDrafts.id, id))
    .returning()
  return rowToDraft(row)
}

export async function reopenDraft(id: string, siteId?: string): Promise<NewsletterDraft> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  if (existing.status !== 'ready_to_send') {
    throw new DraftStatusError(`Cannot reopen draft in status '${existing.status}'`)
  }
  const [row] = await getDb()
    .update(newsletterDrafts)
    .set({
      status: 'draft',
      finalizedAt: null,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(newsletterDrafts.id, id))
    .returning()
  return rowToDraft(row)
}

export async function markDraftTested(id: string, testedTo: string, siteId?: string): Promise<NewsletterDraft> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  if (existing.status === 'sent' || existing.status === 'archived') {
    throw new DraftStatusError(`Cannot record test for draft in status '${existing.status}'`)
  }
  const [row] = await getDb()
    .update(newsletterDrafts)
    .set({
      lastTestedAt: sql`(datetime('now'))`,
      lastTestedTo: testedTo,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(newsletterDrafts.id, id))
    .returning()
  return rowToDraft(row)
}

export async function markDraftSent(id: string, sendId: number, siteId?: string): Promise<NewsletterDraft> {
  const existing = await getDraft(id, siteId)
  if (!existing) throw new DraftNotFoundError(id)
  if (existing.status !== 'ready_to_send') {
    throw new DraftStatusError(`Cannot mark draft as sent from status '${existing.status}'`)
  }
  const [row] = await getDb()
    .update(newsletterDrafts)
    .set({
      status: 'sent',
      sentAt: sql`(datetime('now'))`,
      sentSendId: sendId,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(newsletterDrafts.id, id))
    .returning()
  return rowToDraft(row)
}
