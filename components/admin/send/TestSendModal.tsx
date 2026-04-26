'use client'

import { inputCls } from '../types'

interface TestSendModalProps {
  subject: string
  testEmail: string
  onTestEmailChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export default function TestSendModal({
  subject,
  testEmail,
  onTestEmailChange,
  onCancel,
  onConfirm,
}: TestSendModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Test-Newsletter senden</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          &laquo;[TEST] {subject}&raquo; wird an diese Adresse gesendet:
        </p>
        <input
          type="email"
          value={testEmail}
          onChange={(e) => onTestEmailChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && testEmail.trim()) onConfirm() }}
          placeholder="test@example.com"
          autoFocus
          className={inputCls + ' mb-6'}
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={!testEmail.trim()}
            className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            Test senden
          </button>
        </div>
      </div>
    </div>
  )
}
