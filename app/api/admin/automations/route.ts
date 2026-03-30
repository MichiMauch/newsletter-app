import { isAuthenticated } from '@/lib/admin-auth'
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  saveStep,
  deleteStep,
  reorderSteps,
  getEnrollments,
  getAutomationStepStats,
} from '@/lib/automation'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getSiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'

const SITE_ID = 'kokomo' // TODO: from session/query param when multi-site

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const list = url.searchParams.get('list')
  const id = url.searchParams.get('id')
  const enrollments = url.searchParams.get('enrollments')
  const stats = url.searchParams.get('stats')

  if (list) {
    const automations = await listAutomations(SITE_ID)
    return Response.json(automations)
  }

  if (id) {
    const data = await getAutomation(Number(id))
    if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(data)
  }

  if (enrollments) {
    const data = await getEnrollments(Number(enrollments))
    return Response.json(data)
  }

  if (stats) {
    const data = await getAutomationStepStats(Number(stats))
    return Response.json(data)
  }

  return Response.json({ error: 'Missing query param' }, { status: 400 })
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body

  switch (action) {
    case 'create': {
      const id = await createAutomation(SITE_ID, body.name, body.trigger_type || 'subscriber_confirmed')
      return Response.json({ id })
    }

    case 'update': {
      await updateAutomation(body.id, {
        name: body.name,
        trigger_type: body.trigger_type,
        active: body.active,
      })
      return Response.json({ ok: true })
    }

    case 'delete': {
      await deleteAutomation(body.id)
      return Response.json({ ok: true })
    }

    case 'toggle-active': {
      await updateAutomation(body.id, { active: body.active })
      return Response.json({ ok: true })
    }

    case 'save-step': {
      const stepId = await saveStep({
        id: body.step_id || undefined,
        automation_id: body.automation_id,
        step_order: body.step_order,
        delay_hours: body.delay_hours,
        subject: body.subject,
        blocks_json: body.blocks_json,
      })
      return Response.json({ id: stepId })
    }

    case 'delete-step': {
      await deleteStep(body.step_id)
      return Response.json({ ok: true })
    }

    case 'reorder-steps': {
      await reorderSteps(body.automation_id, body.step_ids)
      return Response.json({ ok: true })
    }

    case 'test-step': {
      const site = await getSiteConfig(SITE_ID)
      const blocks: NewsletterBlock[] = JSON.parse(body.blocks_json)
      const postsMap: Record<string, PostRef> = body.posts_map || {}
      await sendMultiBlockNewsletterEmail(site, {
        email: body.test_email || site.from_email,
        unsubscribeToken: 'test',
        subject: `[TEST] ${body.subject}`,
        blocks,
        postsMap,
      })
      return Response.json({ ok: true })
    }

    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
