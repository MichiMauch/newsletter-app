'use client'

interface WizardStepperProps {
  currentStep: 0 | 1 | 2 | 3 // 0 = template, 1 = content, 2 = audience, 3 = review
  onStepClick: (step: 0 | 1 | 2 | 3) => void
  contentReady: boolean
  audienceReady: boolean
}

export default function WizardStepper({ currentStep, onStepClick, contentReady, audienceReady }: WizardStepperProps) {
  const steps: { label: string; available: boolean }[] = [
    { label: 'Template', available: true },
    { label: 'Inhalte', available: currentStep > 0 },
    { label: 'Empfänger', available: contentReady },
    { label: 'Vorschau & Senden', available: contentReady && audienceReady },
  ]

  return (
    <ol className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] pb-3">
      {steps.map((step, idx) => {
        const isActive = idx === currentStep
        const isPast = idx < currentStep
        const canClick = step.available && !isActive
        return (
          <li key={step.label} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick(idx as 0 | 1 | 2 | 3)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                  : isPast
                    ? 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
                    : 'text-[var(--text-muted)]'
              } ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center text-[10px] tabular-nums ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : isPast
                      ? 'bg-[var(--text)] text-[var(--background)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                }`}
                aria-hidden
              >
                {isPast ? '✓' : idx + 1}
              </span>
              {step.label}
            </button>
            {idx < steps.length - 1 && (
              <span className="text-[var(--text-muted)]" aria-hidden>›</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
