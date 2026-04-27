'use client'

import { useState, type FormEvent } from 'react'

interface FirstNameFormProps {
  token: string
  siteUrl: string | null
}

type Status = 'idle' | 'saving' | 'saved' | 'error' | 'skipped'

export default function FirstNameForm({ token, siteUrl }: FirstNameFormProps) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setStatus('skipped')
      return
    }
    setStatus('saving')
    setError(null)
    try {
      const res = await fetch('/api/v1/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, firstName: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Speichern fehlgeschlagen.')
      }
      setStatus('saved')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  function skip() {
    setStatus('skipped')
  }

  if (status === 'saved') {
    return (
      <div className="mt-6 text-sm text-[var(--foreground-secondary)]">
        <p>Schön, {name.trim()}. Wir melden uns bald.</p>
        {siteUrl && (
          <a
            href={siteUrl}
            className="mt-4 inline-block rounded-full bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
          >
            Zum Blog
          </a>
        )}
      </div>
    )
  }

  if (status === 'skipped') {
    return (
      <div className="mt-6">
        {siteUrl && (
          <a
            href={siteUrl}
            className="inline-block rounded-full bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
          >
            Zum Blog
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="mt-6 border-t border-[var(--border-color)] pt-6 text-left">
      <p className="text-sm text-[var(--foreground-secondary)]">
        Magst du dich uns vorstellen? Dein Vorname reicht — wir nutzen ihn nur für die persönliche Anrede im Newsletter.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dein Vorname"
          maxLength={100}
          disabled={status === 'saving'}
          autoFocus
          className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-50 dark:border-slate-600/50 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={status === 'saving' || !name.trim()}
          className="rounded-full bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-400"
        >
          {status === 'saving' ? 'Speichere…' : 'Speichern'}
        </button>
      </form>
      <button
        type="button"
        onClick={skip}
        disabled={status === 'saving'}
        className="mt-3 text-xs text-[var(--foreground-secondary)] underline-offset-2 hover:underline disabled:opacity-50"
      >
        Überspringen
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
