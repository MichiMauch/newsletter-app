import { isAuthenticated } from '@/lib/admin-auth'
import { getGraph, saveGraph } from '@/lib/graph-automation'
import { validateGraph } from '@/lib/graph-utils'
import type { GraphNode, GraphEdge } from '@/lib/graph-types'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const automationId = parseInt(id, 10)
  if (isNaN(automationId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const graph = await getGraph(automationId)
  return Response.json(graph)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const automationId = parseInt(id, 10)
  if (isNaN(automationId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json()
  const nodes = body.nodes as Array<Omit<GraphNode, 'automation_id' | 'created_at' | 'updated_at'>>
  const edges = body.edges as Array<Omit<GraphEdge, 'automation_id' | 'created_at'>>

  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return Response.json({ error: 'nodes and edges required' }, { status: 400 })
  }

  // Validate
  const fullNodes: GraphNode[] = nodes.map((n) => ({
    ...n,
    automation_id: automationId,
    created_at: '',
    updated_at: '',
  }))
  const fullEdges: GraphEdge[] = edges.map((e) => ({
    ...e,
    automation_id: automationId,
    created_at: '',
  }))
  const result = validateGraph(fullNodes, fullEdges)
  if (!result.valid) {
    return Response.json({ error: 'Validation failed', errors: result.errors }, { status: 400 })
  }

  await saveGraph(automationId, nodes, edges)
  return Response.json({ ok: true })
}
