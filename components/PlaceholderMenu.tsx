'use client'

import { useEffect, useRef, useState } from 'react'

// Placeholders are kept here so the personalization-pipeline source-of-truth
// (lib/personalization.ts) and the editor-time menu stay in lock-step. When a
// new placeholder is added in personalization.ts, mirror it here.
export const PLACEHOLDERS = [
  {
    syntax: '{{firstName}}',
    label: 'Vorname',
    description: 'Vorname des Empfängers — leer wenn nicht gesetzt',
    example: 'Hallo {{firstName}}, schön…  →  Hallo Sibylle, schön…',
  },
  {
    syntax: '{{firstName|du}}',
    label: 'Vorname mit Fallback',
    description: '„du" wenn der Empfänger keinen Vornamen hinterlegt hat',
    example: 'Hallo {{firstName|du}}!  →  Hallo du!',
  },
] as const

interface PlaceholderMenuProps {
  onInsert: (syntax: string) => void
  // Visual variant — toolbar buttons are bare, "chip" variant has a label and
  // is used next to subject/preheader inputs.
  variant?: 'toolbar' | 'chip'
}

export default function PlaceholderMenu({ onInsert, variant = 'toolbar' }: PlaceholderMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(syntax: string) {
    onInsert(syntax)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      {variant === 'toolbar' ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep editor selection
          onClick={() => setOpen((v) => !v)}
          title="Personalisierung einfügen"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex h-7 min-w-[28px] items-center justify-center gap-1 px-1.5 text-xs font-medium transition-colors ${
            open
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 8a7 7 0 1114 0H3z" />
          </svg>
          <span className="text-[10px] uppercase tracking-wider">Vorname</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Personalisierung einfügen"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background-card)] px-3 text-[10px] font-medium uppercase tracking-wider transition-colors ${
            open
              ? 'border-primary-400 text-primary-700 dark:text-primary-300'
              : 'text-[var(--text-secondary)] hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300'
          }`}
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 8a7 7 0 1114 0H3z" />
          </svg>
          Vorname
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-[var(--border)] bg-[var(--background-card)] p-1 shadow-lg"
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Platzhalter einfügen
          </div>
          <ul className="space-y-0.5">
            {PLACEHOLDERS.map((p) => (
              <li key={p.syntax}>
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p.syntax)}
                  className="block w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-[var(--text)]">{p.label}</span>
                    <code className="font-mono text-[11px] text-primary-700 dark:text-primary-300">{p.syntax}</code>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{p.description}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]">{p.example}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
