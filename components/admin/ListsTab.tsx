'use client'

import { useEffect, useState } from 'react'
import type { ToastState } from './types'
import { inputCls } from './types'

export interface SubscriberListSummary {
  id: number
  site_id: string
  name: string
  description: string | null
  created_at: string
  member_count: number
}

export interface SubscriberListMember {
  id: number
  list_id: number
  email: string
  token: string
  added_at: string
}

interface ListsTabProps {
  setToast: (toast: ToastState) => void
}

export default function ListsTab({ setToast }: ListsTabProps) {
  const [lists, setLists] = useState<SubscriberListSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [members, setMembers] = useState<SubscriberListMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [bulkEmails, setBulkEmails] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameDescription, setRenameDescription] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    void loadLists()
  }, [])

  async function loadLists() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lists')
      if (!res.ok) throw new Error('Konnte Listen nicht laden.')
      const data = await res.json()
      setLists(data.lists || [])
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setLoading(false)
    }
  }

  async function loadMembers(listId: number) {
    setSelectedListId(listId)
    setLoadingMembers(true)
    setMembers([])
    try {
      const res = await fetch(`/api/admin/lists?listId=${listId}`)
      if (!res.ok) throw new Error('Konnte Mitglieder nicht laden.')
      const data = await res.json()
      setMembers(data.members || [])
      setRenameValue(data.list?.name ?? '')
      setRenameDescription(data.list?.description ?? '')
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setLoadingMembers(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Anlegen.')
      setNewName('')
      setNewDescription('')
      setToast({ type: 'success', message: `Liste «${newName.trim()}» angelegt.` })
      await loadLists()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRename() {
    if (!selectedListId || !renameValue.trim()) return
    setRenaming(true)
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          id: selectedListId,
          name: renameValue.trim(),
          description: renameDescription.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Speichern.')
      setToast({ type: 'success', message: 'Liste aktualisiert.' })
      await loadLists()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setRenaming(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Löschen.')
      setToast({ type: 'success', message: 'Liste gelöscht.' })
      setConfirmDelete(null)
      if (selectedListId === id) setSelectedListId(null)
      await loadLists()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    }
  }

  async function handleAddMembers() {
    if (!selectedListId || !bulkEmails.trim()) return
    const emails = bulkEmails
      .split(/[\s,;\n]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
    if (emails.length === 0) return

    setAdding(true)
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-members', listId: selectedListId, emails }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Hinzufügen.')

      const parts: string[] = []
      if (data.added > 0) parts.push(`${data.added} hinzugefügt`)
      if (data.skipped_duplicate > 0) parts.push(`${data.skipped_duplicate} bereits drin`)
      if (data.skipped_invalid > 0) parts.push(`${data.skipped_invalid} ungültig`)
      setToast({
        type: data.added > 0 ? 'success' : 'info',
        message: parts.join(' · '),
      })

      setBulkEmails('')
      await loadMembers(selectedListId)
      await loadLists()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveMember(email: string) {
    if (!selectedListId) return
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-member', listId: selectedListId, email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Entfernen.')
      setToast({ type: 'success', message: `${email} entfernt.` })
      await loadMembers(selectedListId)
      await loadLists()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    }
  }

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null

  return (
    <div className="space-y-6">
      {selectedListId === null ? (
        <>
          {/* Liste anlegen */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Neue Liste anlegen</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Listenname (z. B. Test)"
                className={inputCls}
              />
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Beschreibung (optional)"
                className={inputCls}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'Wird angelegt…' : 'Anlegen'}
              </button>
            </div>
          </div>

          {/* Listen-Übersicht */}
          <div className="glass-card overflow-hidden rounded-xl">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h4 className="font-medium text-[var(--text)]">Alle Listen ({lists.length})</h4>
            </div>
            {loading ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">Laden…</div>
            ) : lists.length === 0 ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">
                Noch keine Listen. Lege oben deine erste Liste an.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {lists.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <button
                      onClick={() => loadMembers(l.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium text-[var(--text)]">{l.name}</div>
                      {l.description && (
                        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{l.description}</div>
                      )}
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {l.member_count} {l.member_count === 1 ? 'Empfänger' : 'Empfänger'}
                      </div>
                    </button>
                    {confirmDelete === l.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                        >
                          Doch nicht
                        </button>
                        <button
                          onClick={() => handleDelete(l.id)}
                          className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                        >
                          Wirklich löschen
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => loadMembers(l.id)}
                          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => setConfirmDelete(l.id)}
                          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400"
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Detail-View */}
          <button
            onClick={() => { setSelectedListId(null); setMembers([]) }}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            <span>←</span> Zurück zur Übersicht
          </button>

          {/* Liste umbenennen */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Liste bearbeiten</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Listenname"
                className={inputCls}
              />
              <input
                type="text"
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                placeholder="Beschreibung (optional)"
                className={inputCls}
              />
              <button
                onClick={handleRename}
                disabled={renaming || !renameValue.trim()}
                className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {renaming ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </div>

          {/* Mitglieder hinzufügen */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">Adressen hinzufügen</h3>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Eine pro Zeile, oder durch Komma/Semikolon getrennt. Beliebige Mail-Adressen erlaubt.
            </p>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="test@example.com&#10;michi@kokomo.house"
              rows={4}
              className={inputCls + ' font-mono text-xs'}
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleAddMembers}
                disabled={adding || !bulkEmails.trim()}
                className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {adding ? 'Wird hinzugefügt…' : 'Hinzufügen'}
              </button>
            </div>
          </div>

          {/* Mitglieder-Liste */}
          <div className="glass-card overflow-hidden rounded-xl">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h4 className="font-medium text-[var(--text)]">
                {selectedList?.name ?? 'Liste'} ({members.length} {members.length === 1 ? 'Empfänger' : 'Empfänger'})
              </h4>
            </div>
            {loadingMembers ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">Laden…</div>
            ) : members.length === 0 ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">
                Noch keine Adressen. Füge oben welche hinzu.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1 text-sm text-[var(--text)]">{m.email}</div>
                    <button
                      onClick={() => handleRemoveMember(m.email)}
                      className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400"
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
