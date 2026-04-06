'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes/AllNodes'
import NodeConfigPanel from './NodeConfigPanel'
import type { GraphNode, GraphEdge, NodeConfig, NodeType } from '@/lib/graph-types'
import type { SiteConfig } from '@/lib/site-config'
import { toReactFlowGraph } from '@/lib/graph-utils'

interface Post {
  slug: string; title: string; summary: string; image: string | null; date: string
}

const btnSecondary = 'border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]'

const NEW_NODE_DEFAULTS: Record<NodeType, NodeConfig> = {
  trigger: { trigger_type: 'subscriber_confirmed' },
  delay: { delay_hours: 24 },
  email: { subject: '', blocks_json: '[]' },
  last_newsletter: {},
  condition: { condition_type: 'has_tag', tag: '' },
  tag: { action: 'add', tag: '' },
}

const ADDABLE_TYPES: { key: NodeType; label: string }[] = [
  { key: 'delay', label: 'Warten' },
  { key: 'email', label: 'E-Mail' },
  { key: 'last_newsletter', label: 'Letzter Newsletter' },
  { key: 'condition', label: 'Bedingung' },
  { key: 'tag', label: 'Tag' },
]

const AUTO_SAVE_DELAY = 800

export default function GraphEditor({
  automationId,
  initialNodes,
  initialEdges,
  posts,
  siteConfig,
  onSaved,
}: {
  automationId: number
  initialNodes: GraphNode[]
  initialEdges: GraphEdge[]
  posts: Post[]
  siteConfig: SiteConfig
  onSaved?: () => void
}) {
  const [nodes, setNodes] = useState<Node[]>(() => toReactFlowGraph(initialNodes, initialEdges).nodes)
  const [edges, setEdges] = useState<Edge[]>(() => toReactFlowGraph(initialNodes, initialEdges).edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId])

  // Sync when initial data changes
  useEffect(() => {
    const rf = toReactFlowGraph(initialNodes, initialEdges)
    setNodes(rf.nodes)
    setEdges(rf.edges)
    setSaveStatus('saved')
  }, [initialNodes, initialEdges])

  // ── Auto-Save ──────────────────────────────────────────────────────

  const doSave = useCallback(async () => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const payload = {
        nodes: nodesRef.current.map((n) => ({
          id: n.id,
          node_type: n.data.nodeType as NodeType,
          config: n.data.config as NodeConfig,
          position_x: Math.round(n.position.x),
          position_y: Math.round(n.position.y),
        })),
        edges: edgesRef.current.map((e) => ({
          id: e.id,
          source_node_id: e.source,
          target_node_id: e.target,
          edge_label: (e.sourceHandle === 'yes' || e.sourceHandle === 'no') ? e.sourceHandle : null,
        })),
      }
      const res = await fetch(`/api/admin/automations/${automationId}/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err.errors as string[])?.join(', ') || err.error || 'Speichern fehlgeschlagen')
      }
      setSaveStatus('saved')
      onSaved?.()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Fehler')
      setSaveStatus('error')
    }
  }, [automationId, onSaved])

  const triggerAutoSave = useCallback(() => {
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(), AUTO_SAVE_DELAY)
  }, [doSave])

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // ── React Flow Handlers ────────────────────────────────────────────

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
    if (changes.some((c) => c.type === 'position' && 'dragging' in c && !c.dragging)) {
      triggerAutoSave()
    }
    if (changes.some((c) => c.type === 'remove')) triggerAutoSave()
  }, [triggerAutoSave])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
    if (changes.some((c) => c.type === 'remove')) triggerAutoSave()
  }, [triggerAutoSave])

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = {
      id: crypto.randomUUID(),
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? undefined,
      label: connection.sourceHandle === 'yes' ? 'ja' : connection.sourceHandle === 'no' ? 'nein' : undefined,
      type: 'smoothstep',
    }
    setEdges((eds) => addEdge(newEdge, eds))
    triggerAutoSave()
  }, [triggerAutoSave])

  const handleNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleConfigSave = (config: NodeConfig) => {
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: { ...n.data, config } } : n))
    triggerAutoSave()
  }

  const handleNodeDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
    triggerAutoSave()
  }

  const handleAddNode = (type: NodeType) => {
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0)
    const newNode: Node = {
      id: crypto.randomUUID(),
      type,
      position: { x: 120, y: maxY + 150 },
      data: { config: NEW_NODE_DEFAULTS[type], nodeType: type },
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(newNode.id)
    setShowAddMenu(false)
    triggerAutoSave()
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px]">
      {/* Canvas */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap nodeColor="var(--color-primary)" maskColor="rgba(0,0,0,0.1)" pannable zoomable />
        </ReactFlow>

        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowAddMenu(!showAddMenu)} className={btnSecondary + ' bg-[var(--background-card)]'}>
              + Node
            </button>
            {showAddMenu && (
              <div className="absolute top-full mt-1 border border-[var(--border)] bg-[var(--background-card)] shadow-lg">
                {ADDABLE_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => handleAddNode(t.key)}
                    className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-save status */}
          <div className="flex items-center gap-1.5 bg-[var(--background-card)] border border-[var(--border)] px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)]">
            {saveStatus === 'saving' && <><span className="inline-block h-1.5 w-1.5 bg-amber-400 animate-pulse" /> Speichern…</>}
            {saveStatus === 'saved' && <><span className="inline-block h-1.5 w-1.5 bg-emerald-500" /> Gespeichert</>}
            {saveStatus === 'error' && <><span className="inline-block h-1.5 w-1.5 bg-red-500" /> {saveError || 'Fehler'}</>}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      {selectedNode && (
        <div className="w-[420px] shrink-0">
          <NodeConfigPanel
            nodeId={selectedNode.id}
            nodeType={selectedNode.data.nodeType as NodeType}
            config={selectedNode.data.config as NodeConfig}
            posts={posts}
            siteConfig={siteConfig}
            onSave={handleConfigSave}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNodeId(null)}
          />
        </div>
      )}
    </div>
  )
}
