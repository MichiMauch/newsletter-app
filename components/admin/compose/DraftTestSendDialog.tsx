'use client'

import { useState } from 'react'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'

interface Props {
  draft: NewsletterDraft
  defaultEmail?: string
  onClose: () => void
  onSent: (next: NewsletterDraft) => void
  onError: (message: string) => void
}

export default function DraftTestSendDialog({ draft, defaultEmail, onClose, onSent, onError }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? draft.lastTestedTo ?? '')
  const [busy, setBusy] = useState(false)

  const canSend = email.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  const handleSend = async () => {
    if (!canSend) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${draft.id}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data.error || 'Test-Versand fehlgeschlagen.')
        setBusy(false)
        return
      }
      onSent(data.draft)
    } catch {
      onError('Verbindung fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Test-E-Mail senden</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Sendet eine Vorschau-Mail an die angegebene Adresse. Das Versand-Datum wird im Entwurf festgehalten.
        </p>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Empfänger-Adresse
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
            autoFocus
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
          />
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="glass-button">
            Abbrechen
          </button>
          <button
            onClick={handleSend}
            disabled={busy || !canSend}
            className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Sende…' : 'Test senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
