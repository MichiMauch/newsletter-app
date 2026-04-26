import type { CSSProperties } from 'react'

export type EngagementTier = 'active' | 'moderate' | 'dormant' | 'cold'

interface TierMeta {
  label: string
  description: string
  dot: string
  badge: string
}

const TIER_META: Record<EngagementTier, TierMeta> = {
  active: {
    label: 'Aktiv',
    description: 'Öffnet & klickt regelmässig.',
    dot: 'bg-emerald-500',
    badge:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  },
  moderate: {
    label: 'Mässig',
    description: 'Liest gelegentlich.',
    dot: 'bg-blue-500',
    badge:
      'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  },
  dormant: {
    label: 'Schlafend',
    description: 'Wenig Aktivität in den letzten Wochen.',
    dot: 'bg-amber-500',
    badge:
      'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  },
  cold: {
    label: 'Kalt',
    description: 'Lange keine Reaktion mehr — Re-Engagement-Kandidat.',
    dot: 'bg-red-500',
    badge:
      'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  },
}

const NEUTRAL_DOT = 'bg-[var(--bg-tertiary)]'
const NEUTRAL_BADGE =
  'bg-[var(--bg-secondary)] text-[var(--text-muted)]'

function tooltip(tier: EngagementTier | null | undefined, score: number | null | undefined): string {
  if (!tier) return 'Keine Engagement-Daten'
  const meta = TIER_META[tier]
  const scoreLine = typeof score === 'number' ? ` · Score ${score}` : ''
  return `${meta.label}${scoreLine} · ${meta.description}`
}

interface BaseProps {
  tier: EngagementTier | null | undefined
  score?: number | null
}

// Small inline dot — fits in tables, recipient lists, anywhere
export function EngagementDot({ tier, score, size = 8 }: BaseProps & { size?: number }) {
  const meta = tier ? TIER_META[tier] : null
  const cls = meta ? meta.dot : NEUTRAL_DOT
  const style: CSSProperties = { width: size, height: size }
  return (
    <span
      role="img"
      aria-label={tooltip(tier, score)}
      title={tooltip(tier, score)}
      className={`inline-block shrink-0 ${cls}`}
      style={style}
    />
  )
}

// Pill badge with label and optional score
export function EngagementBadge({ tier, score }: BaseProps) {
  const meta = tier ? TIER_META[tier] : null
  if (!meta) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${NEUTRAL_BADGE}`}>
        Keine Daten
      </span>
    )
  }
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 ${meta.dot}`} aria-hidden />
      {meta.label}
      {typeof score === 'number' && <span className="opacity-60 tabular-nums">· {score}</span>}
    </span>
  )
}

// Dot + small label combo — middle ground for compact rows
export function EngagementDotLabel({ tier, score }: BaseProps) {
  const meta = tier ? TIER_META[tier] : null
  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <span className={`h-1.5 w-1.5 ${NEUTRAL_DOT}`} aria-hidden />
        —
      </span>
    )
  }
  return (
    <span title={meta.description} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <span className={`h-1.5 w-1.5 ${meta.dot}`} aria-hidden />
      <span>{meta.label}</span>
      {typeof score === 'number' && <span className="tabular-nums opacity-60">{score}</span>}
    </span>
  )
}
