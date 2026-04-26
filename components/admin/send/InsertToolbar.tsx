'use client'

import { useState } from 'react'
import type { UserAuthoredBlockType } from '@/lib/newsletter-blocks'

interface InsertToolbarProps {
  onInsert: (type: UserAuthoredBlockType) => void
  alwaysExpanded?: boolean
}

export default function InsertToolbar({ onInsert, alwaysExpanded }: InsertToolbarProps) {
  const [open, setOpen] = useState(false)

  const btnCls =
    'rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

  if (open || alwaysExpanded) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-1"
        onMouseLeave={alwaysExpanded ? undefined : () => setOpen(false)}
      >
        <button onClick={() => { onInsert('hero'); setOpen(false) }} className={btnCls}>+ Hero</button>
        <button onClick={() => { onInsert('text'); setOpen(false) }} className={btnCls}>+ Freitext</button>
        <button onClick={() => { onInsert('link-list'); setOpen(false) }} className={btnCls}>+ Link-Liste</button>
      </div>
    )
  }

  return (
    <div className="group flex items-center justify-center py-1">
      <div className="h-px flex-1 border-t border-dashed border-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100" />
      <button
        onClick={() => setOpen(true)}
        className="mx-2 flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] opacity-40 transition-all hover:border-primary-400 hover:text-primary-500 group-hover:opacity-100 "
        title="Block einfügen"
      >
        +
      </button>
      <div className="h-px flex-1 border-t border-dashed border-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}
