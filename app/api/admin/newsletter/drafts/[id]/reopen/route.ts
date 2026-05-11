import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'
import { reopenDraft, DraftNotFoundError, DraftStatusError } from '@/lib/newsletter-drafts'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
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
