'use client'

import type { WizardData } from './types'
import { TRIGGER_LABELS } from './types'
import { AUTOMATION_PRESETS } from './presets'

export default function WizardOverlay({
  onComplete,
  onCancel,
}: {
  onComplete: (data: WizardData) => void
  onCancel: () => void
}) {
  function selectPreset(presetId: string) {
    const preset = AUTOMATION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    onComplete({
      preset: presetId,
      name: preset.defaultName || 'Neue Automatisierung',
      trigger: preset.trigger,
      triggerConfig: preset.triggerConfig,
      steps: preset.steps,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Neue Automatisierung erstellen
        </h3>
        <button onClick={onCancel} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          Abbrechen
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {AUTOMATION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset.id)}
            className="border border-[var(--border)] bg-[var(--background-card)] p-5 text-left transition-colors hover:border-[var(--text-secondary)]"
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {preset.id === 'blank' ? 'Leer' : 'Vorlage'}
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{preset.label}</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">{preset.description}</div>
            {preset.steps.length > 0 && (
              <div className="mt-3 text-[10px] font-mono text-[var(--text-muted)]">
                {preset.steps.length} Schritt{preset.steps.length !== 1 ? 'e' : ''} · {TRIGGER_LABELS[preset.trigger]}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
