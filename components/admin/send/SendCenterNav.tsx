'use client'

import type { SendSubTab } from '../types'
import { tabToHref } from '../routing'

const SEND_SUB_TAB_LABELS: Record<SendSubTab, string> = {
  compose: 'Erstellen',
  history: 'Historie',
  bounces: 'Probleme',
}

interface Props {
  active: SendSubTab
  // The sub-tab the user just clicked; mirrors AdminSidebar.pendingTab and is
  // used for the same purpose — instant visual feedback while the heavy tab
  // re-render is still in flight.
  pending?: SendSubTab | null
  onChange: (sub: SendSubTab) => void
}

export default function SendCenterNav({ active, pending = null, onChange }: Props) {
  const effective = pending ?? active
  return (
    <div className="flex items-center gap-1 border-b border-[var(--border)]">
      {(['compose', 'history', 'bounces'] as SendSubTab[]).map((sub) => {
        const isActive = sub === effective
        const isLoading = pending === sub
        return (
          <a
            key={sub}
            href={tabToHref('send', sub)}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.button === 1) return
              e.preventDefault()
              onChange(sub)
            }}
            aria-busy={isLoading || undefined}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary-600 text-[var(--text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {SEND_SUB_TAB_LABELS[sub]}
            {isLoading && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </a>
        )
      })}
    </div>
  )
}
