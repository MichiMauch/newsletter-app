'use client'

import type { SendSubTab } from '../types'
import { tabToHref } from '../routing'

const SEND_SUB_TAB_LABELS: Record<SendSubTab, string> = {
  compose: 'Erstellen',
  history: 'Historie',
  bounces: 'Probleme',
}

export default function SendCenterNav({ active, onChange }: { active: SendSubTab; onChange: (sub: SendSubTab) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--border)]">
      {(['compose', 'history', 'bounces'] as SendSubTab[]).map((sub) => {
        const isActive = sub === active
        return (
          <a
            key={sub}
            href={tabToHref('send', sub)}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.button === 1) return
              e.preventDefault()
              onChange(sub)
            }}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary-600 text-[var(--text)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {SEND_SUB_TAB_LABELS[sub]}
          </a>
        )
      })}
    </div>
  )
}
