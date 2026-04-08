'use client'

import { useState, useEffect } from 'react'
import type { ToastState } from './types'

interface SettingsTabProps {
  setToast: (toast: ToastState) => void
}

export default function SettingsTab({ setToast }: SettingsTabProps) {
  const [generatorPrompt, setGeneratorPrompt] = useState('')
  const [reviewerPrompt, setReviewerPrompt] = useState('')
  const [promptsLoaded, setPromptsLoaded] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)

  useEffect(() => {
    loadPrompts()
  }, [])

  async function loadPrompts() {
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings?key=subject_prompt_generator'),
        fetch('/api/admin/settings?key=subject_prompt_reviewer'),
      ])
      if (genRes.ok) {
        const data = await genRes.json()
        setGeneratorPrompt(data.value || '')
      }
      if (revRes.ok) {
        const data = await revRes.json()
        setReviewerPrompt(data.value || '')
      }
    } catch { /* ignore */ }
    setPromptsLoaded(true)
  }

  async function savePrompts() {
    setSavingPrompt(true)
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_generator', value: generatorPrompt }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_reviewer', value: reviewerPrompt }),
        }),
      ])
      if (genRes.ok && revRes.ok) {
        setToast({ type: 'success', message: 'Prompts gespeichert.' })
      } else {
        setToast({ type: 'error', message: 'Fehler beim Speichern der Prompts.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
    }
    setSavingPrompt(false)
  }

  async function resetPrompts() {
    setGeneratorPrompt('')
    setReviewerPrompt('')
    setSavingPrompt(true)
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_generator', value: '' }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_reviewer', value: '' }),
        }),
      ])
      if (genRes.ok && revRes.ok) {
        setToast({ type: 'success', message: 'Prompts zurückgesetzt.' })
      } else {
        setToast({ type: 'error', message: 'Fehler beim Zurücksetzen.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
    }
    setSavingPrompt(false)
  }

  if (!promptsLoaded) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="py-6 text-center text-[var(--text-secondary)]">Laden…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Generator Prompt */}
      <div className="glass-card space-y-4 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-[var(--text)]">Schritt 1: Generator-Prompt</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Generiert 10 Betreffzeilen-Vorschläge und markiert die besten 3.
          Leer lassen für den Standard-Prompt.
        </p>
        <textarea
          value={generatorPrompt}
          onChange={(e) => setGeneratorPrompt(e.target.value)}
          placeholder={`Du bist ein Newsletter-Betreff-Generator für "KOKOMO" — einen Tiny House Blog aus der Schweiz.\nDie Bewohner sind Sibylle und Michi, die seit September 2022 in ihrem Tiny House leben.\n\nDeine Aufgabe: Generiere genau 10 Newsletter-Betreffzeilen basierend auf den Inhalten.\nMarkiere die besten 3 als Top-Vorschläge.\n\nRegeln:\n- Maximal 60 Zeichen pro Betreffzeile\n- Persoenlich und authentisch, kein Clickbait\n- Macht neugierig und animiert zum Oeffnen\n- Verwende "ss" statt "ß"\n- Deutsch (Schweizer Stil)`}
          rows={10}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 "
        />
        <p className="text-xs text-[var(--text-secondary)] opacity-75">
          <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">{'{{content}}'}</code> wird durch den Newsletter-Inhalt ersetzt (optional — der Inhalt wird auch als separate Nachricht gesendet).
          Das JSON-Antwortformat wird automatisch angehängt.
        </p>
      </div>

      {/* Reviewer Prompt */}
      <div className="glass-card space-y-4 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-[var(--text)]">Schritt 2: Reviewer-Prompt</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Wählt die beste Betreffzeile aus oder formuliert eine bessere.
          Leer lassen für den Standard-Prompt.
        </p>
        <textarea
          value={reviewerPrompt}
          onChange={(e) => setReviewerPrompt(e.target.value)}
          placeholder={`Du bist ein erfahrener Newsletter-Redakteur für "KOKOMO" — einen Tiny House Blog aus der Schweiz.\n\nDu erhältst 10 Betreffzeilen-Vorschläge, davon 3 als Top-Vorschläge markiert.\nWähle die beste Betreffzeile aus oder formuliere eine noch bessere basierend auf den Vorschlägen.\n\nKriterien:\n- Maximal 60 Zeichen\n- Hohe Oeffnungsrate\n- Authentisch, nicht reisserisch\n- Verwende "ss" statt "ß"`}
          rows={10}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 "
        />
        <p className="text-xs text-[var(--text-secondary)] opacity-75">
          Erhält die Generator-Vorschläge als Eingabe.
          Das JSON-Antwortformat wird automatisch angehängt.
        </p>
      </div>

      {/* Save / Reset Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={savePrompts}
          disabled={savingPrompt}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {savingPrompt ? 'Speichern…' : 'Beide Prompts speichern'}
        </button>
        <button
          onClick={resetPrompts}
          disabled={savingPrompt}
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          Zurücksetzen
        </button>
      </div>
    </div>
  )
}
