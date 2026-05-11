'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/ui/ToastProvider'
import { parseDbDate } from '@/components/admin/types'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'
import DraftStatusBadge from './DraftStatusBadge'

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '–'
  const d = parseDbDate(dateStr)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'gerade eben'
  if (diff < 3600_000) return `vor ${Math.floor(diff / 60_000)} Min.`
  if (diff < 86_400_000) return `vor ${Math.floor(diff / 3_600_000)} Std.`
  return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}

export default function DraftList() {
  const router = useRouter()
  const toast = useToast()
  const [drafts, setDrafts] = useState<NewsletterDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/newsletter/drafts?status=draft,ready_to_send')
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setDrafts(data.drafts ?? [])
    } catch {
      toast.error('Drafts konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/newsletter/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) throw new Error('create failed')
      const data = await res.json()
      router.push(`/admin/newsletter/compose/${data.draft.id}`)
    } catch {
      toast.error('Draft konnte nicht erstellt werden.')
      setCreating(false)
    }
  }, [router, toast])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      toast.success('Draft gelöscht.')
      setDrafts((prev) => prev.filter((d) => d.id !== id))
    } catch {
      toast.error('Draft konnte nicht gelöscht werden.')
    }
  }, [pendingDeleteId, toast])

  const handleReopen = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${id}/reopen`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'reopen failed')
      }
      toast.success('Draft wieder geöffnet.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Öffnen')
    }
  }, [load, toast])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Newsletter-Entwürfe</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Inhalte erstellen, testen, finalisieren. Versand passiert separat im Bereich «Senden».
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {creating ? 'Erstelle…' : 'Neuer Entwurf'}
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-8 text-center text-sm text-[var(--text-muted)]">
          Lade Entwürfe…
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--background-card)] p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">Noch keine Entwürfe vorhanden.</p>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Ersten Entwurf erstellen
          </button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-card)]">
          {drafts.map((draft) => {
            const isReady = draft.status === 'ready_to_send'
            const title = draft.title?.trim() || draft.subject?.trim() || '(Ohne Titel)'
            return (
              <li key={draft.id} className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/newsletter/compose/${draft.id}`}
                      className="truncate text-sm font-medium text-[var(--text)] hover:underline"
                    >
                      {title}
                    </Link>
                    <DraftStatusBadge status={draft.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>Geändert {formatRelative(draft.updatedAt)}</span>
                    <span>·</span>
                    {draft.lastTestedAt ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Getestet {formatRelative(draft.lastTestedAt)}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Noch nicht getestet</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isReady ? (
                    <button
                      type="button"
                      onClick={() => handleReopen(draft.id)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--background-elevated)]"
                    >
                      Wieder öffnen
                    </button>
                  ) : (
                    <Link
                      href={`/admin/newsletter/compose/${draft.id}`}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--background-elevated)]"
                    >
                      Bearbeiten
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(draft.id)}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Löschen"
                  >
                    Löschen
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">Entwurf löschen?</h3>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="glass-button"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
