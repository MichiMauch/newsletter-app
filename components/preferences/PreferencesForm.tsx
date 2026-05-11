'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ListOption {
  id: number
  name: string
  slug: string
  description: string | null
}

interface InitialState {
  email: string
  firstName: string
  memberships: number[]
  lists: ListOption[]
}

export default function PreferencesForm({
  token,
  initial,
}: {
  token: string
  initial: InitialState
}) {
  const [email, setEmail] = useState(initial.email)
  const [firstName, setFirstName] = useState(initial.firstName)
  const [memberships, setMemberships] = useState<Set<number>>(new Set(initial.memberships))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirmFullUnsub, setConfirmFullUnsub] = useState(false)

  function toggleMembership(listId: number) {
    setMemberships((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: email.trim(),
          firstName: firstName.trim(),
          memberships: [...memberships],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setEmail(data.subscriber.email)
      setFirstName(data.subscriber.firstName)
      setMemberships(new Set(data.memberships.map((m: { listId: number }) => m.listId)))
      setSavedAt(new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function fullUnsubscribe() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      window.location.href = '/newsletter/abgemeldet'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abmeldung fehlgeschlagen.')
      setBusy(false)
      setConfirmFullUnsub(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Newsletter-Einstellungen</h1>
        <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
          Verwalte deine E-Mail-Adresse, deinen Namen und welche Newsletter du erhältst.
        </p>
      </div>

      <Field label="E-Mail">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-accent-500"
        />
      </Field>

      <Field label="Vorname (optional)">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          maxLength={100}
          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-accent-500"
        />
      </Field>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Newsletter</h2>
        {initial.lists.length === 0 ? (
          <p className="text-sm text-[var(--foreground-secondary)]">Aktuell sind keine Newsletter konfiguriert.</p>
        ) : (
          <ul className="space-y-2">
            {initial.lists.map((l) => {
              const checked = memberships.has(l.id)
              return (
                <li key={l.id} className="flex items-start gap-3 rounded-md border border-[var(--border-color)] p-3">
                  <input
                    type="checkbox"
                    id={`list-${l.id}`}
                    checked={checked}
                    onChange={() => toggleMembership(l.id)}
                    className="mt-0.5 h-4 w-4 accent-accent-600"
                  />
                  <label htmlFor={`list-${l.id}`} className="flex-1 cursor-pointer">
                    <div className="text-sm font-medium text-[var(--foreground)]">{l.name}</div>
                    {l.description && (
                      <div className="mt-0.5 text-xs text-[var(--foreground-secondary)]">{l.description}</div>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="text-sm text-emerald-600 dark:text-emerald-400">Gespeichert um {savedAt}.</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? 'Speichere...' : 'Speichern'}
        </button>
        {!confirmFullUnsub ? (
          <button
            type="button"
            onClick={() => setConfirmFullUnsub(true)}
            disabled={busy}
            className="text-sm text-[var(--foreground-secondary)] underline transition-colors hover:text-red-600 dark:hover:text-red-400"
          >
            Komplett abmelden
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-900/20">
            <span className="text-xs text-red-700 dark:text-red-300">Wirklich aus allen Listen abmelden?</span>
            <button
              type="button"
              onClick={fullUnsubscribe}
              disabled={busy}
              className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Ja, abmelden
            </button>
            <button
              type="button"
              onClick={() => setConfirmFullUnsub(false)}
              disabled={busy}
              className="rounded-md px-2 py-1 text-xs text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--background)]"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--foreground-secondary)]">
        Hinweis: Wenn du dich komplett abmeldest, werden alle deine Mitgliedschaften entfernt und du erhältst keine
        weiteren Newsletter mehr.{' '}
        <Link href="/" className="underline hover:text-[var(--foreground)]">Zur Startseite</Link>
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--foreground)]">{label}</span>
      {children}
    </label>
  )
}

