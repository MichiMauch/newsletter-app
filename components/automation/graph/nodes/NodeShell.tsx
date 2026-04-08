'use client'

import React from 'react'
import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'

interface NodeShellProps {
  icon: ReactNode
  label: string
  title: string
  subtitle?: string
  colorClass?: string
  selected?: boolean
  showTargetHandle?: boolean
  showSourceHandle?: boolean
  conditionBranches?: boolean
}

export default React.memo(function NodeShell({
  icon,
  label,
  title,
  subtitle,
  colorClass = 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  selected,
  showTargetHandle = true,
  showSourceHandle = true,
  conditionBranches = false,
}: NodeShellProps) {
  return (
    <div
      className={`w-[240px] border bg-[var(--background-card)] p-4 transition-all ${
        selected
          ? 'border-[var(--color-primary)] shadow-[0_0_0_1px_var(--color-primary)]'
          : 'border-[var(--border)]'
      }`}
    >
      {showTargetHandle && (
        <Handle type="target" position={Position.Top} style={{ background: 'var(--border)', width: 8, height: 8, border: 'none' }} />
      )}

      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center ${colorClass}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
          <div className="mt-0.5 text-sm font-medium text-[var(--text)] truncate">{title}</div>
          {subtitle && <div className="text-[10px] text-[var(--text-muted)] truncate">{subtitle}</div>}
        </div>
      </div>

      {conditionBranches ? (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            style={{ left: '30%', background: '#10b981', width: 10, height: 10, border: 'none' }}
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            style={{ left: '70%', background: '#ef4444', width: 10, height: 10, border: 'none' }}
          />
          <div className="mt-2 flex justify-between px-1 text-[9px] font-mono uppercase tracking-widest">
            <span className="text-emerald-600">ja</span>
            <span className="text-red-500">nein</span>
          </div>
        </>
      ) : showSourceHandle ? (
        <Handle type="source" position={Position.Bottom} style={{ background: 'var(--border)', width: 8, height: 8, border: 'none' }} />
      ) : null}
    </div>
  )
})
