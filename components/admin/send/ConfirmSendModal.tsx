'use client'

import type { AudienceFilter } from '../types'

interface ConfirmSendModalProps {
  subject: string
  audienceCount: number
  audienceFilter: AudienceFilter | null
  scheduledDate: Date | null
  useSto: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmSendModal({
  subject,
  audienceCount,
  audienceFilter,
  scheduledDate,
  useSto,
  onCancel,
  onConfirm,
}: ConfirmSendModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">
          {scheduledDate ? 'Newsletter planen' : 'Newsletter versenden'}
        </h3>
        <p className="mb-1 text-sm text-[var(--text-secondary)]">
          {scheduledDate
            ? 'Bist du sicher, dass du den Newsletter zum gewählten Zeitpunkt verschicken möchtest?'
            : 'Bist du sicher, dass du den Newsletter versenden möchtest?'}
        </p>
        <p className="mb-2 text-sm font-medium text-[var(--text)]">
          &laquo;{subject}&raquo; an {audienceCount} Abonnent{audienceCount !== 1 ? 'en' : ''}
        </p>
        {scheduledDate && (
          <p className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Geplant für: <span className="font-medium text-[var(--text)]">
              {scheduledDate.toLocaleString('de-CH', { dateStyle: 'long', timeStyle: 'short' })}
            </span>
            {useSto && (
              <span className="mt-1 block text-[var(--text-muted)]">
                Mit Send-Time Optimization — Empfänger ohne Profil bekommen die Mail genau zu diesem Zeitpunkt, mit Profil zur persönlichen Lieblingszeit danach.
              </span>
            )}
          </p>
        )}
        {audienceFilter && (
          <p className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Segment: <span className="font-medium text-[var(--text)]">
              {audienceFilter.mode === 'high' ? 'Nur hoch interessiert' : 'Mit Interesse an diesen Tags'}
            </span>
            {' '}({audienceFilter.tags.join(', ')})
          </p>
        )}
        {!audienceFilter && !scheduledDate && <div className="mb-6" />}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            {scheduledDate ? 'Versand planen' : 'Jetzt senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
