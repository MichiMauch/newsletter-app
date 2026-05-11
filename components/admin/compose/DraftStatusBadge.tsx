'use client'

import type { DraftStatus } from '@/lib/newsletter-drafts'

const STATUS_LABEL: Record<DraftStatus, { label: string; cls: string }> = {
  draft: {
    label: 'Entwurf',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  },
  ready_to_send: {
    label: 'Bereit zum Senden',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  },
  sent: {
    label: 'Gesendet',
    cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  },
  archived: {
    label: 'Archiviert',
    cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  },
}

export default function DraftStatusBadge({ status }: { status: DraftStatus }) {
  const meta = STATUS_LABEL[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}>
      {meta.label}
    </span>
  )
}
