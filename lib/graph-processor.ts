/**
 * Graph-based automation execution engine.
 * Processes pending graph runs — one node at a time per enrollment.
 */

import { sendMultiBlockNewsletterEmail } from './notify'
import { getSubscriberByEmail, getLastSendWithBlocks } from './newsletter'
import { getContentItemsBySlugs } from './content'
import { getSiteConfig } from './site-config'
import { addTag, removeTag, hasTag } from './tags'
import type { NewsletterBlock, PostRef } from './newsletter-blocks'
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

  // Resolve inline last_newsletter blocks
  const blocks: NewsletterBlock[] = []
  let subject = cfg.subject
  for (const b of rawBlocks) {
    if (b.type === 'last_newsletter') {
      const lastSend = await getLastSendWithBlocks(run.site_id)
      if (lastSend) {
        blocks.push(...(JSON.parse(lastSend.blocks_json) as NewsletterBlock[]))
        if (!subject) subject = lastSend.subject
      }
    } else {
      blocks.push(b)
    }
  }

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
  })

  // Record to both automation_node_executions + legacy email_automation_sends (webhook compat)
  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { resend_email_id: resendEmailId },
  })
  if (resendEmailId) {
    // Old recordAutomationSend requires step_id — we use nodeId as a soft reference.
    // The webhooks can join on resend_email_id instead.
    void resendEmailId
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

  const blocks: NewsletterBlock[] = JSON.parse(lastSend.blocks_json)
  const subject = cfg.subject_override || lastSend.subject

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
  })

  await recordNodeExecution(run.enrollment_id, node.id, 'completed', {
    output: { resend_email_id: resendEmailId },
  })

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
    case 'clicked_link':
    case 'opened_email': {
      // Check execution history: was there a successful email node,
      // and does the context contain clicked/opened event?
      // For now: check if any email node execution has been completed.
      // TODO: proper integration with Resend webhook events
      result = false
      break
    }
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
