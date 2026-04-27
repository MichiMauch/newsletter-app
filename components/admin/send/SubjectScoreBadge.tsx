'use client'

import { useState } from 'react'
import { useSubjectScore } from '@/hooks/useSubjectScore'

interface Props {
  subject: string
  /** Optional label appended to the score, e.g. "A" / "B" for A/B variants. */
  label?: string
}

export default function SubjectScoreBadge({ subject, label }: Props) {
  const [open, setOpen] = useState(false)
  const [reasoningRequested, setReasoningRequested] = useState(false)
  const { score, factors, similar, reasoning, coldStart, loading } = useSubjectScore(
    subject,
    reasoningRequested,
  )

  if (subject.trim().length === 0) return null

  const tone = scoreTone(score)

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${tone.classes}`}
        title="Subject-Score (Klicken für Details)"
        aria-expanded={open}
      >
        <span className="text-[8px] uppercase tracking-widest opacity-70">
          Score{label ? ` ${label}` : ''}
        </span>
        <span>{score}</span>
        {loading ? (
          <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-80 border border-[var(--border)] bg-[var(--background-card)] p-3 text-xs shadow-lg"
          role="dialog"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Subject-Score Details
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Schliessen"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 space-y-1">
            {factors.length === 0 ? (
              <div className="text-[var(--text-muted)]">Keine Auswertung verfügbar.</div>
            ) : (
              factors.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">{f.label}</span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      f.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : f.delta < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {f.delta > 0 ? `+${f.delta}` : f.delta}
                  </span>
                </div>
              ))
            )}
          </div>

          {coldStart && (
            <p className="mb-3 text-[10px] italic text-[var(--text-muted)]">
              Wenig historische Daten — Score basiert nur auf der Heuristik.
            </p>
          )}

          {similar.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Ähnliche Sends
              </div>
              <ul className="space-y-1">
                {similar.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="truncate text-[var(--text-secondary)]" title={s.subject}>
                      {s.subject}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                      {(s.ctr * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-2">
            {reasoning ? (
              <p className="text-[var(--text)]">{reasoning}</p>
            ) : reasoningRequested ? (
              <p className="text-[var(--text-muted)]">Lade Empfehlung…</p>
            ) : (
              <button
                type="button"
                onClick={() => setReasoningRequested(true)}
                disabled={coldStart}
                className="text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-50"
                title={coldStart ? 'Zu wenig Daten für eine AI-Empfehlung' : 'Claude bewertet den Betreff vs Top/Flop-Sends'}
              >
                ✨ Begründung von Claude holen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function scoreTone(score: number): { classes: string } {
  // Threshold-based colour. Visual only — the UI must still show the number.
  if (score >= 70) {
    return {
      classes:
        'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    }
  }
  if (score >= 40) {
    return {
      classes:
        'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    }
  }
  return {
    classes:
      'border-rose-500/40 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  }
}
