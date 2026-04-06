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
