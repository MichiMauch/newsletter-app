import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import { getDraft, reopenDraft, DraftNotFoundError, DraftStatusError } from '@/lib/newsletter-drafts'
import { cancelNewsletterSend } from '@/lib/newsletter-sends'
import { cancelScheduledSend } from '@/lib/scheduled-sends'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
    // If the draft has been scheduled, cancel the underlying send/queue first
    // so the cron loop does not push the mail after the user reopens it.
    const existing = await getDraft(id, SITE_ID)
    if (existing && existing.status === 'scheduled' && existing.sentSendId) {
      await cancelScheduledSend(existing.sentSendId)
      await cancelNewsletterSend(existing.sentSendId)
    }
    const draft = await reopenDraft(id, SITE_ID)
    return Response.json({ draft })
  } catch (err: unknown) {
    if (err instanceof DraftNotFoundError) {
      return Response.json({ error: err.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    if (err instanceof DraftStatusError) {
      return Response.json({ error: err.message, code: 'INVALID_STATUS' }, { status: 409 })
    }
    console.error('[admin/newsletter/drafts/:id/reopen]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'reopen' } })
    return Response.json({ error: 'Draft konnte nicht wieder geöffnet werden.' }, { status: 500 })
  }
}
