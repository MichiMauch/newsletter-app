'use client'

import { useEffect, useState } from 'react'
import { inputCls, formatDateShort, statusBadge } from './types'
import { EngagementBadge } from '../ui/EngagementIndicator'
import { useToast } from '../ui/ToastProvider'

export interface SubscriberListSummary {
  id: number
  site_id: string
  name: string
  description: string | null
  is_primary: boolean
  created_at: string
  member_count: number
}

export interface SubscriberListMember {
  id: number
  list_id: number
  subscriber_id: number
  email: string
  first_name: string | null
  status: 'pending' | 'active' | 'blocked'
  token: string
  added_at: string
  subscriber_created_at: string
  confirmed_at: string | null
  engagement_score: number | null
  engagement_tier: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags: string[]
}

export default function ListsTab() {
  const toast = useToast()
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
  const [primaryBusy, setPrimaryBusy] = useState(false)

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
      toast.error(err instanceof Error ? err.message : 'Fehler')
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
      toast.error(err instanceof Error ? err.message : 'Fehler')
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
      toast.success(`Liste «${newName.trim()}» angelegt.`)
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
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
      toast.success('Liste aktualisiert.')
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
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
      toast.success('Liste gelöscht.')
      setConfirmDelete(null)
      if (selectedListId === id) setSelectedListId(null)
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function handlePromoteToPrimary(id: number) {
    setPrimaryBusy(true)
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-primary', id, makePrimary: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Setzen der Hauptliste.')
      toast.success('Als Hauptliste markiert.')
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setPrimaryBusy(false)
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
      if (data.skipped_unknown > 0) parts.push(`${data.skipped_unknown} nicht in Stammliste`)
      if (data.skipped_invalid > 0) parts.push(`${data.skipped_invalid} ungültig`)
      toast.toast(data.added > 0 ? 'success' : 'info', parts.join(' · '))

      setBulkEmails('')
      await loadMembers(selectedListId)
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveMember(member: SubscriberListMember) {
    if (!selectedListId) return
    try {
      const res = await fetch('/api/admin/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove-member',
          listId: selectedListId,
          subscriberId: member.subscriber_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Entfernen.')
      toast.success(`${member.email} entfernt.`)
      await loadMembers(selectedListId)
      await loadLists()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
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
                placeholder="Listenname (z. B. Hauptnewsletter)"
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
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text)]">{l.name}</span>
                        {l.is_primary && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                            Hauptliste
                          </span>
                        )}
                      </div>
                      {l.description && (
                        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{l.description}</div>
                      )}
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {l.member_count} Empfänger
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
                        {l.is_primary ? (
                          // Schon Hauptliste: nur Anzeige, kein Klick — Hauptliste
                          // wird ausschliesslich gewechselt, indem eine ANDERE
                          // Liste als Hauptliste markiert wird. Damit kann die
                          // Site nie aus Versehen "ohne Hauptliste" dastehen.
                          <span
                            className="inline-flex cursor-default items-center rounded-full border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                            title="Aktuelle Hauptliste — eine andere Liste promoten, um zu wechseln."
                          >
                            ★ Hauptliste
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePromoteToPrimary(l.id)}
                            disabled={primaryBusy}
                            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
                            title="Als Hauptliste markieren — die bisherige Hauptliste wird automatisch demotet."
                          >
                            Als Hauptliste
                          </button>
                        )}
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
              Eine pro Zeile, oder durch Komma/Semikolon getrennt. <strong>Nur Adressen, die bereits in der
              Stammliste existieren</strong>, können hinzugefügt werden — neue Subscriber legst du über die
              Stammliste mit Double-Opt-In an.
            </p>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="alice@example.com&#10;michi@kokomo.house"
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
                {selectedList?.name ?? 'Liste'} ({members.length} Empfänger)
              </h4>
            </div>
            {loadingMembers ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">Laden…</div>
            ) : members.length === 0 ? (
              <div className="p-6 text-center text-[var(--text-secondary)]">
                Noch keine Mitglieder. Füge oben Adressen aus der Stammliste hinzu.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-secondary)]/50">
                    <tr className="text-left">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">E-Mail</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Engagement</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Tags</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        {selectedList?.is_primary ? 'Angemeldet' : 'In Liste seit'}
                      </th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => {
                      const sBadge = statusBadge[m.status] || statusBadge.pending
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-[var(--border)] last:border-0 ${
                            i % 2 === 0 ? '' : 'bg-[var(--bg-secondary)]/50'
                          }`}
                        >
                          <td className="px-5 py-3">
                            <div className="font-medium text-[var(--text)]">{m.email}</div>
                            {m.first_name && (
                              <div className="text-xs text-[var(--text-secondary)]">{m.first_name}</div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sBadge.cls}`}>
                              {sBadge.label}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <EngagementBadge tier={m.engagement_tier} score={m.engagement_score} />
                          </td>
                          <td className="px-5 py-3">
                            {m.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {m.tags.map((t) => (
                                  <span key={t} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                            {formatDateShort(selectedList?.is_primary ? m.subscriber_created_at : m.added_at)}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleRemoveMember(m)}
                              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400"
                            >
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
