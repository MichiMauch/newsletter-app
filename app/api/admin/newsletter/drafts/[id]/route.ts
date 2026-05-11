import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import {
  getDraft,
  updateDraft,
  deleteDraft,
  DraftNotFoundError,
  DraftStatusError,
} from '@/lib/newsletter-drafts'
import { cancelNewsletterSend } from '@/lib/newsletter-sends'
import { cancelScheduledSend } from '@/lib/scheduled-sends'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const draft = await getDraft(id, SITE_ID)
    if (!draft) return Response.json({ error: 'Draft nicht gefunden.' }, { status: 404 })
    return Response.json({ draft })
  } catch (err: unknown) {
    console.error('[admin/newsletter/drafts/:id GET]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'GET' } })
    return Response.json({ error: 'Draft konnte nicht geladen werden.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const draft = await updateDraft(
      id,
      {
        title: typeof body.title === 'string' ? body.title : undefined,
        subject: typeof body.subject === 'string' ? body.subject : undefined,
        preheader: typeof body.preheader === 'string' || body.preheader === null ? body.preheader : undefined,
        abTestEnabled: typeof body.abTestEnabled === 'boolean' ? body.abTestEnabled : undefined,
        subjectVariantB:
          typeof body.subjectVariantB === 'string' || body.subjectVariantB === null
            ? body.subjectVariantB
            : undefined,
        blocks: Array.isArray(body.blocks) ? (body.blocks as NewsletterBlock[]) : undefined,
      },
      SITE_ID,
    )
    return Response.json({ draft })
  } catch (err: unknown) {
    if (err instanceof DraftNotFoundError) {
      return Response.json({ error: err.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    if (err instanceof DraftStatusError) {
      return Response.json({ error: err.message, code: 'INVALID_STATUS' }, { status: 409 })
    }
    console.error('[admin/newsletter/drafts/:id PATCH]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'PATCH' } })
    return Response.json({ error: 'Draft konnte nicht aktualisiert werden.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const existing = await getDraft(id, SITE_ID)
    if (existing && existing.status === 'scheduled' && existing.sentSendId) {
      await cancelScheduledSend(existing.sentSendId)
      await cancelNewsletterSend(existing.sentSendId)
    }
    await deleteDraft(id, SITE_ID)
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof DraftNotFoundError) {
      return Response.json({ error: err.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    console.error('[admin/newsletter/drafts/:id DELETE]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'DELETE' } })
    return Response.json({ error: 'Draft konnte nicht gelöscht werden.' }, { status: 500 })
  }
}
