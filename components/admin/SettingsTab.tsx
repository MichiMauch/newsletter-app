'use client'

import { useState, useEffect } from 'react'
import { DEFAULT_SUBJECT_PROMPT, DEFAULT_INTRO_PROMPT } from '@/lib/ai-prompts'
import { useToast } from '../ui/ToastProvider'

export default function SettingsTab() {
  const toast = useToast()
  const [subjectPrompt, setSubjectPrompt] = useState('')
  const [introPrompt, setIntroPrompt] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPrompts()
  }, [])

  async function loadPrompts() {
    try {
      const [subjRes, introRes] = await Promise.all([
        fetch('/api/admin/settings?key=subject_prompt'),
        fetch('/api/admin/settings?key=intro_prompt'),
      ])
      if (subjRes.ok) {
        const data = await subjRes.json()
        setSubjectPrompt(data.value || '')
      }
      if (introRes.ok) {
        const data = await introRes.json()
        setIntroPrompt(data.value || '')
      }
    } catch { /* ignore */ }
    setLoaded(true)
  }

  async function savePrompts() {
    setSaving(true)
    try {
      const [subjRes, introRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt', value: subjectPrompt }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'intro_prompt', value: introPrompt }),
        }),
      ])
      if (subjRes.ok && introRes.ok) {
        toast.success('Prompts gespeichert.')
      } else {
        toast.error('Fehler beim Speichern der Prompts.')
      }
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
    }
    setSaving(false)
  }

  async function resetPrompts() {
    setSubjectPrompt('')
    setIntroPrompt('')
    setSaving(true)
    try {
      const [subjRes, introRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt', value: '' }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'intro_prompt', value: '' }),
        }),
      ])
      if (subjRes.ok && introRes.ok) {
        toast.success('Auf Standard zurückgesetzt.')
      } else {
        toast.error('Fehler beim Zurücksetzen.')
      }
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
    }
    setSaving(false)
  }

  function loadDefaultSubject() {
    setSubjectPrompt(DEFAULT_SUBJECT_PROMPT)
  }

  function loadDefaultIntro() {
    setIntroPrompt(DEFAULT_INTRO_PROMPT)
  }

  if (!loaded) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="py-6 text-center text-[var(--text-secondary)]">Laden…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-3 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">AI-Prompts</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Diese Prompts werden vom AI-Assistenten beim Erstellen eines Newsletters verwendet.
          Leer lassen, um den Standard-Prompt zu nutzen. Der Platzhalter{' '}
          <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">{'{{articles}}'}</code>{' '}
          wird durch die Liste der Artikel im Newsletter ersetzt (wenn nicht enthalten, wird sie automatisch angehängt).
        </p>
      </div>

      {/* Subject Prompt */}
      <div className="glass-card space-y-4 rounded-xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Betreffzeilen-Prompt</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Erzeugt 5 Betreffzeilen-Vorschläge im JSON-Format.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDefaultSubject}
            className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            Standard laden
          </button>
        </div>
        <textarea
          value={subjectPrompt}
          onChange={(e) => setSubjectPrompt(e.target.value)}
          placeholder={DEFAULT_SUBJECT_PROMPT}
          rows={18}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>

      {/* Intro Prompt */}
      <div className="glass-card space-y-4 rounded-xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Einleitungstext-Prompt</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Erzeugt einen kurzen Einleitungstext (2–3 Sätze) für den Newsletter.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDefaultIntro}
            className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            Standard laden
          </button>
        </div>
        <textarea
          value={introPrompt}
          onChange={(e) => setIntroPrompt(e.target.value)}
          placeholder={DEFAULT_INTRO_PROMPT}
          rows={18}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>

      {/* Save / Reset Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={savePrompts}
          disabled={saving}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Speichern…' : 'Prompts speichern'}
        </button>
        <button
          onClick={resetPrompts}
          disabled={saving}
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          Auf Standard zurücksetzen
        </button>
      </div>
    </div>
  )
}
