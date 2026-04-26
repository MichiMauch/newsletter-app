'use client'

import { useEffect, useState } from 'react'
import { useToast } from './ToastProvider'

type CopilotContext = 'dashboard' | 'subscribers' | 'compose' | 'other'

interface CopilotAction {
  key: string
  label: string
  description: string
  insightType: 'dashboard-summary' | 'subscriber-risk'
}

const CONTEXT_ACTIONS: Record<CopilotContext, CopilotAction[]> = {
  dashboard: [
    {
      key: 'dashboard-summary',
      label: 'Wochen-Insight',
      description: 'Was lief in den letzten 30 Tagen gut, was nicht?',
      insightType: 'dashboard-summary',
    },
  ],
  subscribers: [
    {
      key: 'subscriber-risk',
      label: 'Engagement-Risiken',
      description: 'Wer ist gefährdet, sich abzumelden?',
      insightType: 'subscriber-risk',
    },
  ],
  compose: [],
  other: [],
}

const CONTEXT_LABEL: Record<CopilotContext, string> = {
  dashboard: 'Dashboard',
  subscribers: 'Abonnenten',
  compose: 'Compose',
  other: 'Allgemein',
}

interface AiCopilotProps {
  context: CopilotContext
  open: boolean
  onClose: () => void
}

export default function AiCopilot({ context, open, onClose }: AiCopilotProps) {
  const toast = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [insights, setInsights] = useState<Record<string, string>>({})

  const actions = CONTEXT_ACTIONS[context] ?? []

  useEffect(() => {
    setInsights({})
  }, [context])

  if (toast.isOverlayOpen || !open) return null

  async function runAction(action: CopilotAction) {
    setLoading(action.key)
    try {
      const res = await fetch('/api/admin/ai-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: action.insightType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'AI-Anfrage fehlgeschlagen.')
      setInsights((curr) => ({ ...curr, [action.key]: data.text }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed bottom-16 left-16 z-[9997] w-96 max-w-[90vw] border border-primary-300 bg-[var(--background-elevated)] shadow-xl dark:border-primary-700">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-primary-50 px-3 py-2 dark:bg-primary-900/30">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-200">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            AI Co-Pilot
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            Kontext: {CONTEXT_LABEL[context]}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Schliessen"
          className="text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3">
        {actions.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-[var(--text-muted)]">
            Für diesen Kontext gibt es noch keine Co-Pilot-Aktionen. Wechsle ins Dashboard oder zu den Abonnenten.
          </p>
        ) : (
          actions.map((action) => {
            const isLoading = loading === action.key
            const result = insights[action.key]
            return (
              <div key={action.key} className="border border-[var(--border)] bg-[var(--background-card)]">
                <button
                  onClick={() => runAction(action)}
                  disabled={isLoading}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">{action.label}</span>
                    {isLoading ? (
                      <svg className="h-3.5 w-3.5 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        {result ? 'Neu laden' : 'Ausführen'}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {action.description}
                  </div>
                </button>
                {result && (
                  <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm leading-relaxed text-[var(--text)]">
                    {result}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
        Antworten basieren auf den letzten 30 Tagen Daten. Nutzt Claude Haiku.
      </div>
    </div>
  )
}
