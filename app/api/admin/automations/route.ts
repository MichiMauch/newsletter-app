import { isAuthenticated } from '@/lib/admin-auth'
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getEnrollments,
  manualEnroll,
  cancelEnrollmentById,
} from '@/lib/automation'
import { getLastSendWithBlocks } from '@/lib/newsletter'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { getSiteConfig } from '@/lib/site-config'
import { getGraph, saveGraph } from '@/lib/graph-automation'
import { getContentItemsBySlugs } from '@/lib/content'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import type { GraphNode, GraphEdge, EmailNodeConfig, LastNewsletterNodeConfig } from '@/lib/graph-types'

const SITE_ID = 'kokomo' // TODO: from session/query param when multi-site

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const list = url.searchParams.get('list')
  const id = url.searchParams.get('id')
  const enrollments = url.searchParams.get('enrollments')
  const lastNewsletter = url.searchParams.get('last-newsletter')

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

  if (lastNewsletter) {
    const data = await getLastSendWithBlocks(SITE_ID)
    return Response.json(data || { subject: null })
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
      const id = await createAutomation(SITE_ID, body.name, body.trigger_type || 'subscriber_confirmed', body.trigger_config)
      return Response.json({ id })
    }

    case 'create-from-wizard': {
      const id = await createAutomation(SITE_ID, body.name, body.trigger_type || 'subscriber_confirmed', body.trigger_config)
      // Build graph: trigger node + chain from preset steps
      const triggerId = crypto.randomUUID()
      const triggerConfig = {
        trigger_type: body.trigger_type || 'subscriber_confirmed',
        ...(JSON.parse(body.trigger_config || '{}')),
      }
      const nodes: Array<Omit<GraphNode, 'automation_id' | 'created_at' | 'updated_at'>> = [{
        id: triggerId, node_type: 'trigger', config: triggerConfig, position_x: 120, position_y: 40,
      }]
      const edges: Array<Omit<GraphEdge, 'automation_id' | 'created_at'>> = []
      let prevId = triggerId
      let y = 40
      if (Array.isArray(body.steps)) {
        for (const s of body.steps) {
          if ((s.delay_hours ?? 0) > 0) {
            y += 150
            const delayId = crypto.randomUUID()
            nodes.push({ id: delayId, node_type: 'delay', config: { delay_hours: s.delay_hours }, position_x: 120, position_y: y })
            edges.push({ id: crypto.randomUUID(), source_node_id: prevId, target_node_id: delayId, edge_label: null })
            prevId = delayId
          }
          y += 150
          const nodeId = crypto.randomUUID()
          const config = s.step_type === 'last_newsletter'
            ? ({} as LastNewsletterNodeConfig)
            : ({ subject: s.subject ?? '', blocks_json: s.blocks_json ?? '[]' } as EmailNodeConfig)
          nodes.push({
            id: nodeId,
            node_type: (s.step_type ?? 'email') as 'email' | 'last_newsletter',
            config,
            position_x: 120, position_y: y,
          })
          edges.push({ id: crypto.randomUUID(), source_node_id: prevId, target_node_id: nodeId, edge_label: null })
          prevId = nodeId
        }
      }
      await saveGraph(id, nodes, edges)
      return Response.json({ id })
    }

    case 'update': {
      await updateAutomation(body.id, { name: body.name, active: body.active })
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

    case 'manual-enroll': {
      if (!body.automation_id || !Array.isArray(body.emails)) {
        return Response.json({ error: 'automation_id und emails sind erforderlich.' }, { status: 400 })
      }
      const count = await manualEnroll(body.automation_id, body.emails)
      return Response.json({ enrolled: count })
    }

    case 'test-automation': {
      const site = await getSiteConfig(SITE_ID)
      const graph = await getGraph(body.automation_id)
      if (graph.nodes.length === 0) {
        return Response.json({ error: 'Automation hat keine Nodes.' }, { status: 400 })
      }

      // Send a test email for each email/last_newsletter node
      const testEmail = process.env.TEST_EMAIL || site.from_email
      let sentCount = 0
      for (const node of graph.nodes) {
        let blocks: NewsletterBlock[] = []
        let subject = ''

        if (node.node_type === 'last_newsletter') {
          const lastSend = await getLastSendWithBlocks(SITE_ID)
          if (!lastSend) continue
          blocks = JSON.parse(lastSend.blocks_json)
          const cfg = node.config as LastNewsletterNodeConfig
          subject = cfg.subject_override || lastSend.subject
        } else if (node.node_type === 'email') {
          const cfg = node.config as EmailNodeConfig
          subject = cfg.subject || '(kein Betreff)'
          const rawBlocks: NewsletterBlock[] = JSON.parse(cfg.blocks_json || '[]')
          for (const b of rawBlocks) {
            if (b.type === 'last_newsletter') {
              const lastSend = await getLastSendWithBlocks(SITE_ID)
              if (lastSend) blocks.push(...(JSON.parse(lastSend.blocks_json) as NewsletterBlock[]))
            } else {
              blocks.push(b)
            }
          }
        } else {
          continue
        }

        const slugs = new Set<string>()
        for (const b of blocks) {
          if (b.type === 'hero') slugs.add(b.slug)
          if (b.type === 'link-list') b.slugs.forEach((s) => slugs.add(s))
        }
        const postsMap: Record<string, PostRef> = slugs.size > 0
          ? await getContentItemsBySlugs(SITE_ID, [...slugs])
          : {}

        await sendMultiBlockNewsletterEmail(site, {
          email: testEmail,
          unsubscribeToken: 'test',
          subject: `[TEST] ${subject}`,
          blocks,
          postsMap,
        })
        sentCount++
      }

      return Response.json({
        message: `${sentCount} Testmail${sentCount !== 1 ? 's' : ''} an ${testEmail} gesendet.`,
      })
    }

    case 'cancel-enrollment': {
      await cancelEnrollmentById(body.enrollment_id)
      return Response.json({ ok: true })
    }

    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
