import type { GraphNode, GraphEdge } from './graph-types'

/**
 * Topological sort via Kahn's algorithm.
 * Returns ordered nodes, or null if graph has a cycle.
 */
export function topoSort(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] | null {
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjList.set(node.id, [])
  }

  for (const edge of edges) {
    adjList.get(edge.source_node_id)?.push(edge.target_node_id)
    inDegree.set(edge.target_node_id, (inDegree.get(edge.target_node_id) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [nodeId, deg] of inDegree) {
    if (deg === 0) queue.push(nodeId)
  }

  const sorted: GraphNode[] = []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const current = queue.shift()!
    const node = nodeMap.get(current)
    if (node) sorted.push(node)
    for (const next of adjList.get(current) ?? []) {
      const newDeg = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  return sorted.length === nodes.length ? sorted : null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): ValidationResult {
  const errors: string[] = []

  const triggerNodes = nodes.filter((n) => n.node_type === 'trigger')
  if (triggerNodes.length === 0) errors.push('Automation braucht mindestens einen Trigger-Node.')
  if (triggerNodes.length > 1) errors.push('Nur ein Trigger-Node erlaubt.')

  // Cycle detection
  const sorted = topoSort(nodes, edges)
  if (sorted === null) errors.push('Graph hat einen Cycle.')

  // All edge endpoints must exist
  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const edge of edges) {
    if (!nodeIds.has(edge.source_node_id)) errors.push(`Edge ${edge.id}: Source-Node existiert nicht.`)
    if (!nodeIds.has(edge.target_node_id)) errors.push(`Edge ${edge.id}: Target-Node existiert nicht.`)
  }

  // Condition nodes must have both yes and no outgoing edges
  const conditionNodes = nodes.filter((n) => n.node_type === 'condition')
  for (const cn of conditionNodes) {
    const outEdges = edges.filter((e) => e.source_node_id === cn.id)
    const hasYes = outEdges.some((e) => e.edge_label === 'yes')
    const hasNo = outEdges.some((e) => e.edge_label === 'no')
    if (!hasYes || !hasNo) {
      errors.push(`Condition-Node "${cn.id}" braucht "ja"- und "nein"-Verbindungen.`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── React Flow Translation ────────────────────────────────────────────

export interface ReactFlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: { config: unknown; nodeType: string }
}

export interface ReactFlowEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: string
  sourceHandle?: string
}

export function toReactFlowGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.node_type,
      position: { x: n.position_x, y: n.position_y },
      data: { config: n.config, nodeType: n.node_type },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      label: e.edge_label ?? undefined,
      sourceHandle: e.edge_label ?? undefined,
      type: 'smoothstep',
    })),
  }
}

export function fromReactFlowGraph(
  rfNodes: ReactFlowNode[],
  rfEdges: ReactFlowEdge[],
  automationId: number,
): { nodes: Array<Omit<GraphNode, 'automation_id' | 'created_at' | 'updated_at'>>; edges: Array<Omit<GraphEdge, 'automation_id' | 'created_at'>> } {
  void automationId
  return {
    nodes: rfNodes.map((n) => ({
      id: n.id,
      node_type: n.data.nodeType as GraphNode['node_type'],
      config: n.data.config as GraphNode['config'],
      position_x: Math.round(n.position.x),
      position_y: Math.round(n.position.y),
    })),
    edges: rfEdges.map((e) => ({
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      edge_label: (e.sourceHandle === 'yes' || e.sourceHandle === 'no')
        ? e.sourceHandle
        : (e.label === 'yes' || e.label === 'no' ? e.label : null),
    })),
  }
}
