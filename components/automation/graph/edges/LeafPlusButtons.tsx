'use client'

import { useMemo } from 'react'
import { ViewportPortal, useNodes, useStore, type Node, type Edge } from '@xyflow/react'
import type { NodeType } from '@/lib/graph-types'
import PlusInsertButton from './PlusInsertButton'

interface LeafPlusButtonsProps {
  edges: Edge[]
  addableTypes: { key: NodeType; label: string }[]
  onInsertAfter: (nodeId: string, sourceHandle: 'yes' | 'no' | null, type: NodeType) => void
}

interface Slot {
  key: string
  nodeId: string
  sourceHandle: 'yes' | 'no' | null
  x: number
  y: number
}

const NODE_WIDTH_FALLBACK = 240
const NODE_HEIGHT_FALLBACK = 80
const CONDITION_HEIGHT_FALLBACK = 110

export default function LeafPlusButtons({ edges, addableTypes, onInsertAfter }: LeafPlusButtonsProps) {
  const nodes = useNodes()
  // Re-render when node measurements update (after layout)
  useStore((s) => s.nodeLookup.size)

  const slots = useMemo<Slot[]>(() => {
    const result: Slot[] = []
    for (const node of nodes as Node[]) {
      const nodeType = (node.data?.nodeType as string | undefined) ?? node.type
      const outgoing = edges.filter((e) => e.source === node.id)
      const measured = (node as Node & { measured?: { width?: number; height?: number } }).measured
      const width = measured?.width ?? NODE_WIDTH_FALLBACK
      const height = measured?.height ?? (nodeType === 'condition' ? CONDITION_HEIGHT_FALLBACK : NODE_HEIGHT_FALLBACK)
      const baseX = node.position.x
      const baseY = node.position.y + height + 16

      if (nodeType === 'condition') {
        const hasYes = outgoing.some((e) => e.sourceHandle === 'yes')
        const hasNo = outgoing.some((e) => e.sourceHandle === 'no')
        if (!hasYes) result.push({ key: `${node.id}:yes`, nodeId: node.id, sourceHandle: 'yes', x: baseX + width * 0.3, y: baseY })
        if (!hasNo) result.push({ key: `${node.id}:no`, nodeId: node.id, sourceHandle: 'no', x: baseX + width * 0.7, y: baseY })
      } else {
        if (outgoing.length === 0) {
          result.push({ key: `${node.id}:end`, nodeId: node.id, sourceHandle: null, x: baseX + width / 2, y: baseY })
        }
      }
    }
    return result
  }, [nodes, edges])

  if (slots.length === 0) return null

  return (
    <ViewportPortal>
      {slots.map((s) => (
        <div
          key={s.key}
          style={{
            position: 'absolute',
            transform: `translate(${s.x}px, ${s.y}px) translate(-50%, 0)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {/* connector stub */}
          <div
            aria-hidden
            className="absolute left-1/2 -top-4 h-4 w-px -translate-x-1/2 bg-[var(--border)]"
          />
          <PlusInsertButton
            types={addableTypes}
            onSelect={(type) => onInsertAfter(s.nodeId, s.sourceHandle, type)}
          />
          <div className="mt-2 text-center text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
            End
          </div>
        </div>
      ))}
    </ViewportPortal>
  )
}
