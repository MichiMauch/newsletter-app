'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EngagementPrediction } from '@/lib/engagement-prediction'
import type { AudienceFilter, AudienceMode } from '../types'

interface EngagementPanelProps {
  slugs: string[]
  audienceMode: AudienceMode
  onAudienceChange: (filter: AudienceFilter | null) => void
}

export default function EngagementPanel({ slugs, audienceMode, onAudienceChange }: EngagementPanelProps) {
  const slugKey = useMemo(() => [...new Set(slugs)].sort().join('|'), [slugs])
  const [prediction, setPrediction] = useState<EngagementPrediction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (slugKey === '') {
      setPrediction(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/engagement-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugs: slugKey.split('|') }),
        })
        if (cancelled) return
        if (!res.ok) {
          setError('Prognose konnte nicht geladen werden.')
          setPrediction(null)
        } else {
          const data = (await res.json()) as EngagementPrediction
          setPrediction(data)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setError('Prognose konnte nicht geladen werden.')
          setPrediction(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [slugKey])

  if (slugKey === '') return null

  const high = prediction?.buckets.find((b) => b.level === 'high')
  const medium = prediction?.buckets.find((b) => b.level === 'medium')
  const cold = prediction?.buckets.find((b) => b.level === 'cold')
  const total = prediction?.totalConfirmed ?? 0
  const reachedAny = (high?.count ?? 0) + (medium?.count ?? 0)
  const reachPct = total > 0 ? Math.round((reachedAny / total) * 100) : 0
  const noTags = prediction !== null && prediction.tags.length === 0
  const noSignals = prediction !== null && prediction.tags.length > 0 && reachedAny === 0

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text)]">Engagement-Prognose</span>
          {loading && (
            <svg className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        {prediction && prediction.tags.length > 0 && (
          <span className="text-xs text-[var(--text-secondary)]">
            Tags: {prediction.tags.join(', ')}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {noTags && (
        <p className="text-xs text-[var(--text-secondary)]">
          Diese Artikel haben (noch) keine Tags — Prognose nicht möglich.
        </p>
      )}

      {prediction && prediction.tags.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <BucketCard
              dotClass="bg-emerald-500"
              label="Hoch interessiert"
              count={high?.count ?? 0}
              hint={high && high.count > 0 ? `ø ${high.avgSignal.toFixed(1)} Klicks` : '—'}
            />
            <BucketCard
              dotClass="bg-amber-500"
              label="Eher interessiert"
              count={medium?.count ?? 0}
              hint={medium && medium.count > 0 ? `ø ${medium.avgSignal.toFixed(1)} Klicks` : '—'}
            />
            <BucketCard
              dotClass="bg-[var(--border)]"
              label="Wenig Signal"
              count={cold?.count ?? 0}
              hint="keine Klicks zu diesen Tags"
            />
          </div>

          {prediction.byTag.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prediction.byTag.map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background-elevated)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  <span className="font-medium text-[var(--text)]">{t.tag}</span>
                  <span className="opacity-60">·</span>
                  <span>{t.interestedCount}</span>
                </span>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {noSignals
              ? 'Noch keine Klick-Historie zu diesen Tags. Erste Sendungen sind ein Blindflug — danach wird die Prognose schärfer.'
              : `${reachPct}% deiner ${total} Abonnenten zeigten in der Vergangenheit Interesse an mindestens einem dieser Tags.`}
          </p>

          <AudienceSelector
            mode={audienceMode}
            allCount={total}
            engagedCount={reachedAny}
            highCount={high?.count ?? 0}
            tags={prediction.tags}
            onChange={onAudienceChange}
          />

          <SimilarSendsBlock stats={prediction.similarSends} />
        </>
      )}
    </div>
  )
}

interface AudienceSelectorProps {
  mode: AudienceMode
  allCount: number
  engagedCount: number
  highCount: number
  tags: string[]
  onChange: (filter: AudienceFilter | null) => void
}

function AudienceSelector({ mode, allCount, engagedCount, highCount, tags, onChange }: AudienceSelectorProps) {
  // Keep parent in sync if a non-default mode is active and counts shift
  // (e.g. after the prediction refreshed because tags changed)
  useEffect(() => {
    if (mode === 'all') return
    const count = mode === 'high' ? highCount : engagedCount
    onChange({ mode, tags, count })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, highCount, engagedCount, tags.join('|')])

  const buttons: Array<{ key: AudienceMode; label: string; count: number; disabled: boolean }> = [
    { key: 'all', label: 'Alle', count: allCount, disabled: false },
    { key: 'engaged', label: 'Mit Interesse', count: engagedCount, disabled: engagedCount === 0 },
    { key: 'high', label: 'Nur hoch', count: highCount, disabled: highCount === 0 },
  ]

  function selectMode(next: AudienceMode) {
    if (next === 'all') {
      onChange(null)
      return
    }
    const count = next === 'high' ? highCount : engagedCount
    onChange({ mode: next, tags, count })
  }

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        Empfängerkreis
      </div>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => {
          const active = mode === b.key
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => !b.disabled && selectMode(b.key)}
              disabled={b.disabled}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
                (active
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-[var(--border)] bg-[var(--background-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]')
              }
            >
              {b.label} <span className={active ? 'opacity-90' : 'opacity-60'}>· {b.count}</span>
            </button>
          )
        })}
      </div>
      {mode !== 'all' && (
        <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
          Versand nur an Abonnenten, deren Klick-Historie zu diesen Tags passt.
        </p>
      )}
    </div>
  )
}

function SimilarSendsBlock({ stats }: { stats: EngagementPrediction['similarSends'] }) {
  if (stats.sampleSize === 0) return null
  const lowSample = stats.sampleSize < 3
  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          Ähnliche Sendungen
        </span>
        <span className="text-[11px] text-[var(--text-secondary)]">
          n = {stats.sampleSize}{lowSample ? ' · sehr klein' : ''}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-[var(--text)]">{stats.avgClickRate.toFixed(1)}%</span>
        <span className="text-xs text-[var(--text-secondary)]">ø Klickrate</span>
      </div>
      {stats.examples.length > 0 && (
        <ul className="mt-2 space-y-1">
          {stats.examples.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-[var(--text-secondary)]">{ex.subject}</span>
              <span className="shrink-0 text-[var(--text)]">{ex.clickRate.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
      {lowSample && (
        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
          Wenige vergleichbare Sendungen — Aussagekraft begrenzt.
        </p>
      )}
    </div>
  )
}

function BucketCard({ dotClass, label, count, hint }: { dotClass: string; label: string; count: number; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className="text-xl font-semibold text-[var(--text)]">{count}</div>
      <div className="text-[11px] text-[var(--text-secondary)]">{hint}</div>
    </div>
  )
}
