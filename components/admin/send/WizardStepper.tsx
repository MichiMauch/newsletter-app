'use client'

import type { ReactNode } from 'react'

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4 | 5
// 0 = template, 1 = content, 2 = subject, 3 = test, 4 = audience, 5 = review

interface WizardStepperProps {
  currentStep: WizardStepIndex
  onStepClick: (step: WizardStepIndex) => void
  contentReady: boolean
  subjectReady: boolean
  audienceReady: boolean
  trailing?: ReactNode
}

export default function WizardStepper({
  currentStep,
  onStepClick,
  contentReady,
  subjectReady,
  audienceReady,
  trailing,
}: WizardStepperProps) {
  const steps: { label: string; available: boolean }[] = [
    { label: 'Template', available: true },
    { label: 'Inhalte', available: currentStep > 0 },
    { label: 'Betreff', available: contentReady },
    { label: 'Testen', available: contentReady && subjectReady },
    { label: 'Empfänger', available: contentReady && subjectReady },
    { label: 'Vorschau & Senden', available: contentReady && subjectReady && audienceReady },
  ]

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {steps.map((step, idx) => {
          const isActive = idx === currentStep
          const isPast = idx < currentStep
          const canClick = step.available && !isActive
          return (
            <li key={step.label} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canClick}
                onClick={() => canClick && onStepClick(idx as WizardStepIndex)}
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
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}
