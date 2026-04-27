'use client'

import { useState } from 'react'

// Available placeholders for personal salutation in newsletter copy. Kept in
// one place so subject, preheader, and text-block helpers stay in sync.
const PLACEHOLDERS = [
  {
    syntax: '{{firstName}}',
    description: 'Vorname des Empfängers',
    example: 'Sibylle',
    fallback: '(leer wenn nicht gesetzt)',
  },
  {
    syntax: '{{firstName|du}}',
    description: 'Vorname mit Fallback',
    example: 'Sibylle',
    fallback: 'oder „du" wenn nicht gesetzt',
  },
] as const

const EXAMPLES = [
  { template: 'Hallo {{firstName|du}}, schön dass du dabei bist.', set: 'Hallo Sibylle, schön dass du dabei bist.', empty: 'Hallo du, schön dass du dabei bist.' },
] as const

export default function PlaceholderHelp() {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((current) => (current === text ? null : current)), 1600)
    } catch {
      // Older browsers / restricted contexts — fail silently
    }
  }

  return (
    <details className="mt-3 group rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]">
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.5 4.5a.5.5 0 00-1 0V11h-2a.5.5 0 000 1H10v3.5a.5.5 0 001 0V12h2a.5.5 0 000-1h-2.5V6.5z" />
          </svg>
          <span>Verfügbare Platzhalter</span>
        </span>
        <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.04l3.71-3.81a.75.75 0 111.08 1.04l-4.25 4.36a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </summary>

      <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
        <ul className="space-y-2">
          {PLACEHOLDERS.map((p) => (
            <li key={p.syntax} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copy(p.syntax)}
                title="Klicken zum Kopieren"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background-card)] px-2 py-1 font-mono text-[11px] text-[var(--text)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
              >
                <span>{p.syntax}</span>
                {copied === p.syntax ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">kopiert</span>
                ) : (
                  <svg className="h-3 w-3 opacity-50" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M8 2a2 2 0 00-2 2v1H5a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H8zm0 2h4v1H8V4z" />
                  </svg>
                )}
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                {p.description} <span className="text-[var(--text-muted)]">{p.fallback}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-md border border-[var(--border)] bg-[var(--background-card)] px-3 py-2 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Beispiel</div>
          {EXAMPLES.map((ex) => (
            <div key={ex.template} className="space-y-1">
              <div className="font-mono text-[11px] text-[var(--text)]">{ex.template}</div>
              <div className="text-[var(--text-secondary)]">
                <span className="text-[10px] text-[var(--text-muted)]">→ mit Vorname:</span> {ex.set}
              </div>
              <div className="text-[var(--text-secondary)]">
                <span className="text-[10px] text-[var(--text-muted)]">→ ohne Vorname:</span> {ex.empty}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}
