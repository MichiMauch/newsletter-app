'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
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

interface ToolbarProps {
  name: string
  active: number
  testing: boolean
  onNameChange: (name: string) => void
  onNameBlur: () => void
  onBack: () => void
  onDelete: () => void
  onTest: () => void
  onToggleActive: () => void
}

const btnSecondary = 'border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]'

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
  toolbar,
}: {
  automationId: number
  initialNodes: GraphNode[]
  initialEdges: GraphEdge[]
  posts: Post[]
  siteConfig: SiteConfig
  onSaved?: () => void
  toolbar?: ToolbarProps
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

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // ── React Flow Handlers ────────────────────────────────────────────

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
    if (changes.some((c) => c.type === 'position' && 'dragging' in c && !c.dragging)) triggerAutoSave()
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
    setShowAddMenu(false)
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
    <div className="relative h-screen w-full">
      {/* Canvas — absolute full area */}
      <div className="absolute inset-0">
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
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Floating Toolbar — top left */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        {toolbar && (
          <button onClick={toolbar.onBack} className="flex h-8 w-8 items-center justify-center bg-[var(--background-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        {toolbar && (
          <input
            type="text"
            value={toolbar.name}
            onChange={(e) => toolbar.onNameChange(e.target.value)}
            onBlur={toolbar.onNameBlur}
            className="h-8 w-48 border border-[var(--border)] bg-[var(--background-card)] px-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--color-primary)]"
          />
        )}
        <div className="relative">
          <button onClick={() => setShowAddMenu(!showAddMenu)} className={btnSecondary + ' h-8 bg-[var(--background-card)]'}>
            + Node
          </button>
          {showAddMenu && (
            <div className="absolute top-full mt-1 border border-[var(--border)] bg-[var(--background-card)] shadow-lg z-20">
              {ADDABLE_TYPES.map((t) => (
                <button key={t.key} onClick={() => handleAddNode(t.key)} className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]">
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--background-card)] border border-[var(--border)] px-2 py-1 text-[10px] font-mono text-[var(--text-muted)]">
          {saveStatus === 'saving' && <><span className="inline-block h-1.5 w-1.5 bg-amber-400 animate-pulse" /> Speichern…</>}
          {saveStatus === 'saved' && <><span className="inline-block h-1.5 w-1.5 bg-emerald-500" /> Gespeichert</>}
          {saveStatus === 'error' && <><span className="inline-block h-1.5 w-1.5 bg-red-500" /> {saveError || 'Fehler'}</>}
        </div>
      </div>

      {/* Floating Toolbar — top right */}
      {toolbar && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <button onClick={toolbar.onTest} disabled={toolbar.testing} className={btnSecondary + ' h-8 bg-[var(--background-card)]'}>
            {toolbar.testing ? 'Senden…' : 'Testen'}
          </button>
          <div className="flex items-center gap-1.5 bg-[var(--background-card)] border border-[var(--border)] px-2 py-1">
            <span className="text-[10px] text-[var(--text-muted)]">{toolbar.active ? 'Aktiv' : 'Inaktiv'}</span>
            <button onClick={toolbar.onToggleActive} className="relative h-4 w-7 shrink-0 transition-colors" style={{ background: toolbar.active ? 'var(--color-primary)' : 'var(--border)' }}>
              <span className="absolute top-0.5 h-3 w-3 bg-white transition-all" style={{ left: toolbar.active ? 'calc(100% - 14px)' : '2px' }} />
            </button>
          </div>
          <button onClick={toolbar.onDelete} className="h-8 px-2 text-[10px] text-red-500 bg-[var(--background-card)] border border-[var(--border)] hover:text-red-700">
            Löschen
          </button>
        </div>
      )}

      {/* Right Sidebar — fixed to screen edge, slide-in */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-30 w-[420px] shadow-xl transition-transform duration-300 ease-in-out ${
          selectedNode ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedNode && (
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
        )}
      </div>
    </div>
  )
}
