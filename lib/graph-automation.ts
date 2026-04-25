import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  automationNodes,
  automationEdges,
  automationNodeExecutions,
  emailAutomationEnrollments,
  emailAutomations,
} from './schema'
import type {
  GraphNode,
  GraphEdge,
  NodeConfig,
  NodeType,
  GraphRun,
  NodeExecution,
  TriggerType,
} from './graph-types'

// ─── Graph Read/Write ──────────────────────────────────────────────────

export async function getGraph(automationId: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const db = getDb()
  const [nodes, edges] = await Promise.all([
    db.select().from(automationNodes).where(eq(automationNodes.automationId, automationId)),
    db.select().from(automationEdges).where(eq(automationEdges.automationId, automationId)),
  ])
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      automation_id: n.automationId,
      node_type: n.nodeType,
      config: JSON.parse(n.configJson) as NodeConfig,
      position_x: n.positionX,
      position_y: n.positionY,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      automation_id: e.automationId,
      source_node_id: e.sourceNodeId,
      target_node_id: e.targetNodeId,
      edge_label: e.edgeLabel as 'yes' | 'no' | null,
      created_at: e.createdAt,
    })),
  }
}

export async function saveGraph(
  automationId: number,
  nodes: Array<Omit<GraphNode, 'automation_id' | 'created_at' | 'updated_at'>>,
  edges: Array<Omit<GraphEdge, 'automation_id' | 'created_at'>>,
): Promise<void> {
  const db = getDb()
  // Delete existing edges first (FK dependency), then nodes, then re-insert
  await db.delete(automationEdges).where(eq(automationEdges.automationId, automationId))
  await db.delete(automationNodes).where(eq(automationNodes.automationId, automationId))

  if (nodes.length > 0) {
    await db.insert(automationNodes).values(nodes.map((n) => ({
      id: n.id,
      automationId,
      nodeType: n.node_type,
      configJson: JSON.stringify(n.config),
      positionX: n.position_x,
      positionY: n.position_y,
    })))
  }

  if (edges.length > 0) {
    await db.insert(automationEdges).values(edges.map((e) => ({
      id: e.id,
      automationId,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      edgeLabel: e.edge_label,
    })))
  }
}

// ─── Trigger Node Helpers ──────────────────────────────────────────────

export async function getTriggerNode(automationId: number): Promise<GraphNode | null> {
  const db = getDb()
  const rows = await db.select().from(automationNodes)
    .where(and(eq(automationNodes.automationId, automationId), eq(automationNodes.nodeType, 'trigger')))
    .limit(1)
  if (rows.length === 0) return null
  const n = rows[0]
  return {
    id: n.id,
    automation_id: n.automationId,
    node_type: n.nodeType,
    config: JSON.parse(n.configJson) as NodeConfig,
    position_x: n.positionX,
    position_y: n.positionY,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  }
}

// Find automations for a given trigger type across all sites
export async function getAutomationsByTriggerType(
  siteId: string,
  triggerType: TriggerType,
): Promise<Array<{ automationId: number; triggerNodeId: string; config: NodeConfig }>> {
  const db = getDb()
  const rows = await db
    .select({
      automationId: emailAutomations.id,
      triggerNodeId: automationNodes.id,
      configJson: automationNodes.configJson,
    })
    .from(emailAutomations)
    .innerJoin(automationNodes, eq(automationNodes.automationId, emailAutomations.id))
    .where(and(
      eq(emailAutomations.siteId, siteId),
      eq(emailAutomations.active, 1),
      eq(automationNodes.nodeType, 'trigger'),
    ))

  return rows
    .map((r) => {
      const config = JSON.parse(r.configJson) as NodeConfig
      return { automationId: r.automationId, triggerNodeId: r.triggerNodeId, config }
    })
    .filter((r) => {
      const cfg = r.config as { trigger_type?: string }
      return cfg.trigger_type === triggerType
    })
}

// ─── Graph Run / Enrollment ────────────────────────────────────────────

export async function enrollInGraph(
  automationId: number,
  email: string,
  triggerRef?: string,
): Promise<number | null> {
  const triggerNode = await getTriggerNode(automationId)
  if (!triggerNode) return null

  const db = getDb()
  try {
    const result = await db.insert(emailAutomationEnrollments).values({
      automationId,
      subscriberEmail: email.toLowerCase(),
      status: 'active',
      currentNodeId: triggerNode.id,
      contextJson: '{}',
      triggerRef: triggerRef ?? null,
    }).returning({ id: emailAutomationEnrollments.id })
    return result[0].id
  } catch {
    // Already enrolled (unique constraint), skip
    return null
  }
}

export async function advanceEnrollmentToNode(
  enrollmentId: number,
  nodeId: string | null,
  context?: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  const set: Record<string, unknown> = { currentNodeId: nodeId }
  if (context !== undefined) set.contextJson = JSON.stringify(context)
  if (nodeId === null) {
    set.status = 'completed'
    set.completedAt = sql`datetime('now')`
  }
  await db.update(emailAutomationEnrollments).set(set).where(eq(emailAutomationEnrollments.id, enrollmentId))
}

// ─── Node Execution Log ────────────────────────────────────────────────

export async function recordNodeExecution(
  enrollmentId: number,
  nodeId: string,
  status: 'pending' | 'completed' | 'failed' | 'skipped',
  opts?: { output?: Record<string, unknown>; error?: string; retryCount?: number },
): Promise<number> {
  const db = getDb()
  const result = await db.insert(automationNodeExecutions).values({
    enrollmentId,
    nodeId,
    status,
    startedAt: sql`datetime('now')` as never,
    completedAt: status !== 'pending' ? (sql`datetime('now')` as never) : null,
    error: opts?.error ?? null,
    outputJson: opts?.output ? JSON.stringify(opts.output) : null,
    retryCount: opts?.retryCount ?? 0,
  }).returning({ id: automationNodeExecutions.id })
  return result[0].id
}

export async function updateNodeExecution(
  executionId: number,
  status: 'completed' | 'failed' | 'skipped',
  opts?: { output?: Record<string, unknown>; error?: string },
): Promise<void> {
  const db = getDb()
  await db.update(automationNodeExecutions).set({
    status,
    completedAt: sql`datetime('now')` as never,
    error: opts?.error ?? null,
    outputJson: opts?.output ? JSON.stringify(opts.output) : null,
  }).where(eq(automationNodeExecutions.id, executionId))
}

export async function getLatestExecution(
  enrollmentId: number,
  nodeId: string,
): Promise<NodeExecution | null> {
  const db = getDb()
  const rows = await db.select().from(automationNodeExecutions).where(and(
    eq(automationNodeExecutions.enrollmentId, enrollmentId),
    eq(automationNodeExecutions.nodeId, nodeId),
  )).orderBy(sql`${automationNodeExecutions.id} DESC`).limit(1)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    enrollment_id: r.enrollmentId,
    node_id: r.nodeId,
    status: r.status,
    started_at: r.startedAt,
    completed_at: r.completedAt,
    error: r.error,
    output: r.outputJson ? JSON.parse(r.outputJson) : null,
    retry_count: r.retryCount,
  }
}

// ─── Next Node Lookup (Edges) ──────────────────────────────────────────

export async function getNextNodes(
  automationId: number,
  fromNodeId: string,
  edgeLabel?: 'yes' | 'no' | null,
): Promise<string[]> {
  const db = getDb()
  const conditions = [
    eq(automationEdges.automationId, automationId),
    eq(automationEdges.sourceNodeId, fromNodeId),
  ]
  if (edgeLabel !== undefined) {
    if (edgeLabel === null) {
      conditions.push(sql`${automationEdges.edgeLabel} IS NULL`)
    } else {
      conditions.push(eq(automationEdges.edgeLabel, edgeLabel))
    }
  }
  const rows = await db.select({ target: automationEdges.targetNodeId }).from(automationEdges).where(and(...conditions))
  return rows.map((r) => r.target)
}

// ─── Pending Runs Query ────────────────────────────────────────────────

export async function getPendingGraphRuns(): Promise<GraphRun[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      e.id AS enrollment_id, e.subscriber_email, e.current_node_id,
      e.context_json, e.enrolled_at,
      a.id AS automation_id, a.name AS automation_name, a.site_id
    FROM email_automation_enrollments e
    JOIN email_automations a ON a.id = e.automation_id AND a.active = 1
    WHERE e.status = 'active' AND e.current_node_id IS NOT NULL
    ORDER BY e.id
  `)
  return (rows.rows ?? []).map((r) => ({
    enrollment_id: r.enrollment_id as number,
    subscriber_email: r.subscriber_email as string,
    current_node_id: r.current_node_id as string | null,
    context: JSON.parse((r.context_json as string) || '{}'),
    enrolled_at: r.enrolled_at as string,
    automation_id: r.automation_id as number,
    automation_name: r.automation_name as string,
    site_id: r.site_id as string,
  }))
}

// ─── Trigger Firing: link_clicked ──────────────────────────────────────

export async function enrollOnLinkClick(siteId: string, email: string, url: string): Promise<number> {
  const automations = await getAutomationsByTriggerType(siteId, 'link_clicked')
  let count = 0
  for (const a of automations) {
    const cfg = a.config as { trigger_type?: string; url_contains?: string }
    const needle = (cfg.url_contains ?? '').trim()
    if (needle && !url.includes(needle)) continue
    const id = await enrollInGraph(a.automationId, email, `link_clicked:${url}`)
    if (id) count++
  }
  return count
}

// ─── Trigger Firing: no_activity_days (Cron-Scan) ──────────────────────

export interface InactivityScanResult {
  automationId: number
  enrolled: number
}

export async function runInactivityTriggers(): Promise<InactivityScanResult[]> {
  const db = getDb()
  // Step 1: find all (automation_id, site_id, days) tuples for active no_activity_days automations
  const triggerRows = await db.run(sql`
    SELECT a.id AS automation_id, a.site_id, n.config_json
    FROM email_automations a
    JOIN automation_nodes n ON n.automation_id = a.id AND n.node_type = 'trigger'
    WHERE a.active = 1
  `)

  const targets: Array<{ automationId: number; siteId: string; days: number }> = []
  for (const r of triggerRows.rows ?? []) {
    try {
      const cfg = JSON.parse(r.config_json as string) as { trigger_type?: string; days?: number }
      if (cfg.trigger_type !== 'no_activity_days') continue
      const days = Number(cfg.days)
      if (!Number.isFinite(days) || days <= 0) continue
      targets.push({ automationId: r.automation_id as number, siteId: r.site_id as string, days })
    } catch { /* skip malformed */ }
  }

  const results: InactivityScanResult[] = []
  for (const t of targets) {
    const cutoff = new Date(Date.now() - t.days * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    // Confirmed subscribers whose last click is before the cutoff (or who never clicked
    // and whose confirmedAt is before the cutoff), and who are not already enrolled.
    const candidates = await db.run(sql`
      SELECT s.email
      FROM newsletter_subscribers s
      LEFT JOIN newsletter_sends sn ON sn.site_id = s.site_id
      LEFT JOIN newsletter_recipients nr ON nr.send_id = sn.id AND nr.email = s.email
      WHERE s.site_id = ${t.siteId}
        AND s.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1 FROM email_automation_enrollments e
          WHERE e.automation_id = ${t.automationId} AND e.subscriber_email = s.email
        )
      GROUP BY s.email, s.confirmed_at
      HAVING COALESCE(MAX(nr.clicked_at), s.confirmed_at) < ${cutoff}
    `)

    let enrolled = 0
    for (const r of candidates.rows ?? []) {
      const id = await enrollInGraph(t.automationId, r.email as string, `no_activity:${t.days}d`)
      if (id) enrolled++
    }
    results.push({ automationId: t.automationId, enrolled })
  }

  return results
}

// ─── Trigger Firing: engagement_below (Cron-Scan) ──────────────────────

export interface EngagementScanResult {
  automationId: number
  threshold: number
  enrolled: number
}

export async function runEngagementTriggers(): Promise<EngagementScanResult[]> {
  const db = getDb()
  const triggerRows = await db.run(sql`
    SELECT a.id AS automation_id, a.site_id, n.config_json
    FROM email_automations a
    JOIN automation_nodes n ON n.automation_id = a.id AND n.node_type = 'trigger'
    WHERE a.active = 1
  `)

  const targets: Array<{ automationId: number; siteId: string; threshold: number }> = []
  for (const r of triggerRows.rows ?? []) {
    try {
      const cfg = JSON.parse(r.config_json as string) as { trigger_type?: string; threshold?: number }
      if (cfg.trigger_type !== 'engagement_below') continue
      const threshold = Number(cfg.threshold)
      if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) continue
      targets.push({ automationId: r.automation_id as number, siteId: r.site_id as string, threshold })
    } catch { /* skip malformed */ }
  }

  const results: EngagementScanResult[] = []
  for (const t of targets) {
    // Subscriber unter threshold, nur 'confirmed', noch nicht enrolled
    const candidates = await db.run(sql`
      SELECT se.subscriber_email AS email
      FROM subscriber_engagement se
      JOIN newsletter_subscribers s ON s.email = se.subscriber_email AND s.site_id = se.site_id
      WHERE se.site_id = ${t.siteId}
        AND se.score < ${t.threshold}
        AND se.sends_90d > 0
        AND s.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1 FROM email_automation_enrollments e
          WHERE e.automation_id = ${t.automationId} AND e.subscriber_email = se.subscriber_email
        )
    `)

    let enrolled = 0
    for (const r of candidates.rows ?? []) {
      const id = await enrollInGraph(t.automationId, r.email as string, `engagement_below:${t.threshold}`)
      if (id) enrolled++
    }
    results.push({ automationId: t.automationId, threshold: t.threshold, enrolled })
  }

  return results
}

export async function getNode(nodeId: string): Promise<GraphNode | null> {
  const db = getDb()
  const rows = await db.select().from(automationNodes).where(eq(automationNodes.id, nodeId)).limit(1)
  if (rows.length === 0) return null
  const n = rows[0]
  return {
    id: n.id,
    automation_id: n.automationId,
    node_type: n.nodeType,
    config: JSON.parse(n.configJson) as NodeConfig,
    position_x: n.positionX,
    position_y: n.positionY,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  }
}
