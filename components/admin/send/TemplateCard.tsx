'use client'

import type { NewsletterBlock, NewsletterTemplate } from '@/lib/newsletter-blocks'

const slotMiniIcons: Record<NewsletterBlock['type'], React.ReactElement> = {
  hero: (
    <div className="mb-1 h-4 rounded bg-primary-200 dark:bg-primary-800" />
  ),
  text: (
    <div className="mb-1 space-y-0.5">
      <div className="h-1 w-full rounded bg-[var(--border)]" />
      <div className="h-1 w-3/4 rounded bg-[var(--border)]" />
    </div>
  ),
  'link-list': (
    <div className="mb-1 space-y-0.5">
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-3/4 rounded bg-primary-100 dark:bg-primary-900" />
    </div>
  ),
  last_newsletter: (
    <div className="mb-1 h-4 rounded bg-amber-200 dark:bg-amber-800" />
  ),
  recap_header: <div className="mb-1 h-1 rounded bg-[var(--border)]" />,
}

interface TemplateCardProps {
  template: NewsletterTemplate
  onSelect: () => void
  onDelete?: () => void
}

export default function TemplateCard({ template, onSelect, onDelete }: TemplateCardProps) {
  return (
    <button
      onClick={onSelect}
      className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4 text-left transition-all hover:border-primary-400 dark:hover:border-primary-500"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {onDelete && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute right-2 top-2 hidden rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-500 group-hover:inline-block dark:bg-red-900/30"
        >
          &times;
        </span>
      )}
      <div className="mb-3 space-y-1 rounded-lg bg-[var(--bg-secondary)] p-2">
        {template.slots.map((slot, i) => (
          <div key={i}>{slotMiniIcons[slot.type]}</div>
        ))}
      </div>
      <span className="text-xs font-semibold text-[var(--text)]">{template.name}</span>
    </button>
  )
}
