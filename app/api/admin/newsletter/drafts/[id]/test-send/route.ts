import * as Sentry from '@sentry/nextjs'
import { isAuthenticated } from '@/lib/admin-auth'
import { DEFAULT_SITE_ID as SITE_ID, getSiteConfig } from '@/lib/site-config'
import {
  getDraft,
  markDraftTested,
  DraftNotFoundError,
  DraftStatusError,
} from '@/lib/newsletter-drafts'
import { actionTestSend } from '@/lib/newsletter-actions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const testEmail = typeof body.testEmail === 'string' ? body.testEmail : ''
    if (!testEmail) {
      return Response.json({ error: 'testEmail ist erforderlich.', code: 'MISSING_EMAIL' }, { status: 400 })
    }

    const draft = await getDraft(id, SITE_ID)
    if (!draft) return Response.json({ error: 'Draft nicht gefunden.', code: 'NOT_FOUND' }, { status: 404 })
    if (draft.status === 'sent' || draft.status === 'archived') {
      return Response.json(
        { error: `Test in status '${draft.status}' nicht möglich.`, code: 'INVALID_STATUS' },
        { status: 409 },
      )
    }
    if (!draft.subject.trim()) {
      return Response.json({ error: 'Subject fehlt.', code: 'MISSING_SUBJECT' }, { status: 400 })
    }
    if (draft.blocks.length === 0) {
      return Response.json({ error: 'Keine Blocks im Draft.', code: 'MISSING_BLOCKS' }, { status: 400 })
    }

    const site = await getSiteConfig(SITE_ID)
    const sendResponse = await actionTestSend(
      {
        subject: draft.subject,
        preheader: draft.preheader ?? undefined,
        blocks: draft.blocks,
        testEmail,
      },
      site,
    )

    if (!sendResponse.ok) {
      return sendResponse
    }

    const updated = await markDraftTested(id, testEmail.trim().toLowerCase(), SITE_ID)
    return Response.json({ draft: updated, ok: true })
  } catch (err: unknown) {
    if (err instanceof DraftNotFoundError) {
      return Response.json({ error: err.message, code: 'NOT_FOUND' }, { status: 404 })
    }
    if (err instanceof DraftStatusError) {
      return Response.json({ error: err.message, code: 'INVALID_STATUS' }, { status: 409 })
    }
    console.error('[admin/newsletter/drafts/:id/test-send]', err)
    Sentry.captureException(err, { tags: { area: 'admin-drafts', method: 'test-send' } })
    return Response.json({ error: 'Test-E-Mail konnte nicht versendet werden.' }, { status: 500 })
  }
}
