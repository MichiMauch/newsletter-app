import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import { createDraft, listDrafts, type DraftStatus } from '@/lib/newsletter-drafts'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'

const VALID_STATUSES: DraftStatus[] = ['draft', 'ready_to_send', 'sent', 'archived']

function parseStatusParam(raw: string | null): DraftStatus | DraftStatus[] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter((s): s is DraftStatus => (VALID_STATUSES as string[]).includes(s))
  if (valid.length === 0) return undefined
  return valid.length === 1 ? valid[0] : valid
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  try {
    const url = new URL(request.url)
    const status = parseStatusParam(url.searchParams.get('status'))
    const drafts = await listDrafts({ siteId: SITE_ID, status })
    return Response.json({ drafts })
  } catch (err: unknown) {
    console.error('[admin/newsletter/drafts GET]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'GET' } })
    return Response.json({ error: 'Drafts konnten nicht geladen werden.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const draft = await createDraft({
      siteId: SITE_ID,
      title: typeof body.title === 'string' ? body.title : undefined,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      preheader: typeof body.preheader === 'string' ? body.preheader : undefined,
      abTestEnabled: typeof body.abTestEnabled === 'boolean' ? body.abTestEnabled : undefined,
      subjectVariantB: typeof body.subjectVariantB === 'string' ? body.subjectVariantB : undefined,
      blocks: Array.isArray(body.blocks) ? (body.blocks as NewsletterBlock[]) : undefined,
    })
    return Response.json({ draft }, { status: 201 })
  } catch (err: unknown) {
    console.error('[admin/newsletter/drafts POST]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'POST' } })
    return Response.json({ error: 'Draft konnte nicht erstellt werden.' }, { status: 500 })
  }
}
