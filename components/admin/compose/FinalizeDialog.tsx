'use client'

import { useState } from 'react'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'

interface Props {
  draft: NewsletterDraft
  onClose: () => void
  onFinalized: (next: NewsletterDraft) => void
  onError: (message: string) => void
}

interface Check {
  ok: boolean
  required: boolean
  label: string
  hint?: string
}

export default function FinalizeDialog({ draft, onClose, onFinalized, onError }: Props) {
  const [busy, setBusy] = useState(false)

  const checks: Check[] = [
    {
      ok: draft.subject.trim().length > 0,
      required: true,
      label: 'Betreff gesetzt',
    },
    {
      ok: draft.blocks.length > 0,
      required: true,
      label: 'Mindestens ein Block vorhanden',
    },
    {
      ok: !draft.abTestEnabled || (draft.subjectVariantB?.trim().length ?? 0) > 0,
      required: true,
      label: draft.abTestEnabled ? 'Betreff B gesetzt (A/B aktiv)' : 'A/B-Test deaktiviert',
    },
    {
      ok: !!draft.lastTestedAt,
      required: false,
      label: 'Test-E-Mail durchgeführt',
      hint: 'Optional, aber empfohlen vor dem Versand.',
    },
  ]

  const blockingFailure = checks.some((c) => c.required && !c.ok)

  const handleFinalize = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${draft.id}/finalize`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data.error || 'Finalisieren fehlgeschlagen.')
        setBusy(false)
        return
      }
      onFinalized(data.draft)
    } catch {
      onError('Verbindung fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Entwurf finalisieren</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Finalisierte Entwürfe erscheinen im Bereich «Senden». Inhalt kann später wieder bearbeitet werden.
        </p>

        <ul className="mb-5 space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                c.ok
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : c.required
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}>
                {c.ok ? '✓' : c.required ? '✗' : '!'}
              </span>
              <div className="flex-1">
                <div className={c.ok ? 'text-[var(--text)]' : 'text-[var(--text)]'}>{c.label}</div>
                {!c.ok && c.hint && (
                  <div className="text-xs text-[var(--text-muted)]">{c.hint}</div>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="glass-button">
            Abbrechen
          </button>
          <button
            onClick={handleFinalize}
            disabled={busy || blockingFailure}
            className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Finalisiere…' : 'Zum Senden freigeben'}
          </button>
        </div>
      </div>
    </div>
  )
}
