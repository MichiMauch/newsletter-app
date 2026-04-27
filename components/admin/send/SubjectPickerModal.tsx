'use client'

interface SubjectPickerModalProps {
  options: string[]
  generating: boolean
  canRegenerate: boolean
  target?: 'a' | 'b'
  onSelect: (subject: string) => void
  onRegenerate: () => void
  onClose: () => void
}

export default function SubjectPickerModal({
  options,
  generating,
  canRegenerate,
  target,
  onSelect,
  onRegenerate,
  onClose,
}: SubjectPickerModalProps) {
  const heading = target === 'b'
    ? 'Betreffzeile · Variante B'
    : target === 'a'
      ? 'Betreffzeile · Variante A'
      : 'Betreffzeile wählen'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">{heading}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            aria-label="Schliessen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {generating && options.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {options.map((option, i) => (
              <li key={i}>
                <button
                  onClick={() => onSelect(option)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-left text-sm text-[var(--text)] transition-colors hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--background-elevated)] text-[10px] font-semibold text-[var(--text-secondary)] group-hover:bg-primary-600 group-hover:text-white">
                    {i + 1}
                  </span>
                  <span className="flex-1">{option}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={onRegenerate}
            disabled={generating || !canRegenerate}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >
            {generating ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span>↻</span>
            )}
            {generating ? 'Generiere…' : 'Neu generieren'}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
