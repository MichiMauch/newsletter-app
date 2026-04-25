'use client'

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { NodeType } from '@/lib/graph-types'
import PlusInsertButton from './PlusInsertButton'

export interface PlusEdgeData extends Record<string, unknown> {
  onInsert: (edgeId: string, type: NodeType) => void
  addableTypes: { key: NodeType; label: string }[]
}

export default function PlusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const d = data as PlusEdgeData | undefined
  const types = d?.addableTypes ?? []

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {label && (
            <div className="mb-1 text-center text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
              {label}
            </div>
          )}
          <PlusInsertButton
            types={types}
            onSelect={(type) => d?.onInsert(id, type)}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
