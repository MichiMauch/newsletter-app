/**
 * Graph-based automation execution engine.
 * Processes pending graph runs — one node at a time per enrollment.
 */

import * as Sentry from '@sentry/nextjs'
import { sendMultiBlockNewsletterEmail } from './notify'
import { getSubscriberByEmail, getLastSendWithBlocks } from './newsletter'
import { hasClickedNewsletterLink } from './newsletter-sends'
import { getContentItemsBySlugs } from './content'
import { getSiteConfig } from './site-config'
import { addTag, removeTag, hasTag } from './tags'
import {
  expandInlineLastNewsletter,
  wrapLastNewsletterStandalone,
  type NewsletterBlock,
  type PostRef,
} from './newsletter-blocks'
import type { SiteConfig } from './site-config'
import type {
  GraphRun,
  GraphNode,
  DelayNodeConfig,
  EmailNodeConfig,
  LastNewsletterNodeConfig,
  ConditionNodeConfig,
  TagNodeConfig,
} from './graph-types'
import { recordGraphAutomationSend, hasClickedAutomationEmail } from './automation'
import {
  getPendingGraphRuns,
  getNode,
  getNextNodes,
  advanceEnrollmentToNode,
  recordNodeExecution,
  updateNodeExecution,
  getLatestExecution,
} from './graph-automation'

const MAX_RETRIES = 3

export interface ProcessResult {
  email: string
  automation: string
  node_id: string
  node_type: string
  status: string
  error?: string
}

export async function processGraphRuns(): Promise<ProcessResult[]> {
  const runs = await getPendingGraphRuns()
  const results: ProcessResult[] = []
  const siteConfigs = new Map<string, SiteConfig>()

  for (const run of runs) {
    if (!run.current_node_id) continue

    const node = await getNode(run.current_node_id)
    if (!node) {
      // Node was deleted — complete the run
      await advanceEnrollmentToNode(run.enrollment_id, null)
      results.push({ email: run.subscriber_email, automation: run.automation_name, node_id: run.current_node_id, node_type: 'unknown', status: 'skipped_node_missing' })
      continue
    }

    let site = siteConfigs.get(run.site_id)
    if (!site) {
      site = await getSiteConfig(run.site_id)
      siteConfigs.set(run.site_id, site)
    }

    try {
      const outcome = await executeNode(run, node, site)
      results.push({
        email: run.subscriber_email,
        automation: run.automation_name,
        node_id: node.id,
        node_type: node.node_type,
        status: outcome.status,
        ...(outcome.error ? { error: outcome.error } : {}),
      })
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { area: 'graph-processor', node_type: node.node_type },
        extra: {
          enrollmentId: run.enrollment_id,
          nodeId: node.id,
          subscriberEmail: run.subscriber_email,
        },
      })
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[graph-processor] ${run.automation_name} / ${run.subscriber_email} / ${node.node_type}:`, err)
      const prior = await getLatestExecution(run.enrollment_id, node.id)
      const newRetryCount = (prior?.retry_count ?? 0) + 1
      if (newRetryCount > MAX_RETRIES) {
        await recordNodeExecution(run.enrollment_id, node.id, 'skipped', { error: msg, retryCount: newRetryCount })
        // Advance past this node
        const next = await getNextNodes(run.automation_id, node.id)
        await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
        results.push({ email: run.subscriber_email, automation: run.automation_name, node_id: node.id, node_type: node.node_type, status: 'skipped_max_retries', error: msg })
      } else {
        await recordNodeExecution(run.enrollment_id, node.id, 'failed', { error: msg, retryCount: newRetryCount })
        results.push({ email: run.subscriber_email, automation: run.automation_name, node_id: node.id, node_type: node.node_type, status: 'failed', error: msg })
      }
    }
  }

  return results
}

// ─── Node Execution Dispatch ──────────────────────────────────────────

async function executeNode(
  run: GraphRun,
  node: GraphNode,
  site: SiteConfig,
): Promise<{ status: string; error?: string }> {
  switch (node.node_type) {
    case 'trigger':
      return executeTrigger(run, node)
    case 'delay':
      return executeDelay(run, node)
    case 'email':
      return executeEmail(run, node, site)
    case 'last_newsletter':
      return executeLastNewsletter(run, node, site)
    case 'condition':
      return executeCondition(run, node)
    case 'tag':
      return executeTag(run, node)
    default:
      return { status: 'skipped_unknown_type' }
  }
}

// ─── Trigger: advance to next ─────────────────────────────────────────

async function executeTrigger(run: GraphRun, node: GraphNode): Promise<{ status: string }> {
  const next = await getNextNodes(run.automation_id, node.id)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: 'trigger_advanced' }
}

// ─── Delay: wait, then advance ────────────────────────────────────────

async function executeDelay(run: GraphRun, node: GraphNode): Promise<{ status: string }> {
  const cfg = node.config as DelayNodeConfig
  const prior = await getLatestExecution(run.enrollment_id, node.id)

  if (!prior) {
    // First visit — start the delay timer
    await recordNodeExecution(run.enrollment_id, node.id, 'pending')
    return { status: 'delay_started' }
  }

  if (prior.status === 'pending') {
    // Check if delay elapsed
    const startedMs = new Date(prior.started_at + 'Z').getTime()
    const nowMs = Date.now()
    const elapsedHours = (nowMs - startedMs) / (1000 * 60 * 60)
    if (elapsedHours < cfg.delay_hours) {
      return { status: 'delay_waiting' }
    }
    // Delay elapsed
    await updateNodeExecution(prior.id, 'completed')
    const next = await getNextNodes(run.automation_id, node.id)
    await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
    return { status: 'delay_completed' }
  }

  // Already completed — shouldn't happen (we would have advanced), but handle safely
  const next = await getNextNodes(run.automation_id, node.id)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: 'delay_completed' }
}

// ─── Email: send + advance ────────────────────────────────────────────

async function executeEmail(
  run: GraphRun,
  node: GraphNode,
  site: SiteConfig,
): Promise<{ status: string }> {
  const cfg = node.config as EmailNodeConfig
  const rawBlocks: NewsletterBlock[] = JSON.parse(cfg.blocks_json)

  // Resolve inline last_newsletter blocks (only fetch lastSend if needed)
  const hasLastNewsletterBlock = rawBlocks.some((b) => b.type === 'last_newsletter')
  const lastSend = hasLastNewsletterBlock ? await getLastSendWithBlocks(run.site_id) : null
  const lastSendBlocks = lastSend ? (JSON.parse(lastSend.blocks_json) as NewsletterBlock[]) : null
  const blocks = expandInlineLastNewsletter(rawBlocks, lastSendBlocks)
  const subject = cfg.subject || lastSend?.subject || ''

  const subscriber = await getSubscriberByEmail(run.site_id, run.subscriber_email)
  if (!subscriber) {
    return { status: 'skipped_no_subscriber' }
  }

  // Resolve posts
  const slugs = new Set<string>()
  for (const b of blocks) {
    if (b.type === 'hero') slugs.add(b.slug)
    if (b.type === 'link-list') b.slugs.forEach((s) => slugs.add(s))
  }
  const postsMap: Record<string, PostRef> = slugs.size > 0
    ? await getContentItemsBySlugs(run.site_id, [...slugs])
    : {}

  const { resendEmailId } = await sendMultiBlockNewsletterEmail(site, {
    email: run.subscriber_email,
    unsubscribeToken: subscriber.token,
    subject,
    blocks,
    postsMap,
    firstName: subscriber.firstName,
  })

  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { resend_email_id: resendEmailId },
  })
  // Send-Zeile für den Webhook: er sucht Ereignisse ausschliesslich über die
  // resend_email_id. Ohne diese Zeile landeten Klicks, Bounces und Beschwerden
  // zu Automations-Mails im Nichts.
  if (resendEmailId) {
    await recordGraphAutomationSend(run.enrollment_id, node.id, resendEmailId)
  }

  const next = await getNextNodes(run.automation_id, node.id)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: 'email_sent' }
}

// ─── Last Newsletter: wraps email with last send content ──────────────

async function executeLastNewsletter(
  run: GraphRun,
  node: GraphNode,
  site: SiteConfig,
): Promise<{ status: string }> {
  const cfg = node.config as LastNewsletterNodeConfig
  const lastSend = await getLastSendWithBlocks(run.site_id)
  if (!lastSend) {
    // No newsletter to send — skip and advance
    const next = await getNextNodes(run.automation_id, node.id)
    await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
    return { status: 'skipped_no_last_newsletter' }
  }

  const subscriber = await getSubscriberByEmail(run.site_id, run.subscriber_email)
  if (!subscriber) {
    return { status: 'skipped_no_subscriber' }
  }

  const expandedBlocks: NewsletterBlock[] = JSON.parse(lastSend.blocks_json)
  const blocks = wrapLastNewsletterStandalone(expandedBlocks, node.id)
  const subject = cfg.subject_override || lastSend.subject
  const preheader = lastSend.preheader

  const slugs = new Set<string>()
  for (const b of blocks) {
    if (b.type === 'hero') slugs.add(b.slug)
    if (b.type === 'link-list') b.slugs.forEach((s) => slugs.add(s))
  }
  const postsMap: Record<string, PostRef> = slugs.size > 0
    ? await getContentItemsBySlugs(run.site_id, [...slugs])
    : {}

  const { resendEmailId } = await sendMultiBlockNewsletterEmail(site, {
    email: run.subscriber_email,
    unsubscribeToken: subscriber.token,
    subject,
    preheader,
    blocks,
    postsMap,
    firstName: subscriber.firstName,
  })

  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { resend_email_id: resendEmailId },
  })
  // Auch dieser Node verschickt echte Mails — ohne Send-Zeile fielen ihre
  // Webhook-Ereignisse genauso durch wie beim normalen Email-Node.
  if (resendEmailId) {
    await recordGraphAutomationSend(run.enrollment_id, node.id, resendEmailId)
  }

  const next = await getNextNodes(run.automation_id, node.id)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: 'last_newsletter_sent' }
}

// ─── Condition: evaluate + branch ─────────────────────────────────────

async function executeCondition(run: GraphRun, node: GraphNode): Promise<{ status: string }> {
  const cfg = node.config as ConditionNodeConfig
  let result = false

  switch (cfg.condition_type) {
    case 'has_tag':
      if (cfg.tag) {
        result = await hasTag(run.site_id, run.subscriber_email, cfg.tag)
      }
      break
    case 'clicked_link': {
      // Zeitfenster ab Enrollment: die Bedingung soll auf eine Reaktion
      // innerhalb dieser Automation reagieren, nicht auf einen Klick von vor
      // einem Jahr.
      result = await hasClickedNewsletterLink(run.site_id, run.subscriber_email, {
        since: run.enrolled_at,
        urlContains: cfg.url_contains,
      })
      // Mails, die die Automation selbst verschickt hat, werden separat
      // geführt und halten nur die Klickanzahl fest, nicht die URLs. Deshalb
      // zählen sie nur, wenn gar kein URL-Filter gesetzt ist — sonst würde ein
      // beliebiger Klick als Treffer für eine bestimmte URL durchgehen.
      if (!result && !cfg.url_contains?.trim()) {
        result = await hasClickedAutomationEmail(run.enrollment_id)
      }
      break
    }
    case 'opened_email':
      // Bleibt bewusst false: Open-Tracking ist bei Resend abgeschaltet, weil
      // Apple Mail Privacy Protection Tracking-Pixel automatisch beim Zustellen
      // lädt und die Öffnungsrate damit vor allem den Apple-Anteil der Liste
      // misst. Eine Bedingung, die auf solchen Daten verzweigt, wäre schlechter
      // als gar keine. Der Node-Typ ist im Builder entsprechend markiert.
      result = false
      break
  }

  const label: 'yes' | 'no' = result ? 'yes' : 'no'
  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { branch: label, result },
  })

  const next = await getNextNodes(run.automation_id, node.id, label)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: `condition_${label}` }
}

// ─── Tag: add/remove + advance ────────────────────────────────────────

async function executeTag(run: GraphRun, node: GraphNode): Promise<{ status: string }> {
  const cfg = node.config as TagNodeConfig
  if (cfg.action === 'add') {
    await addTag(run.site_id, run.subscriber_email, cfg.tag)
  } else {
    await removeTag(run.site_id, run.subscriber_email, cfg.tag)
  }
  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { action: cfg.action, tag: cfg.tag },
  })

  const next = await getNextNodes(run.automation_id, node.id)
  await advanceEnrollmentToNode(run.enrollment_id, next[0] ?? null, run.context)
  return { status: `tag_${cfg.action}` }
}
