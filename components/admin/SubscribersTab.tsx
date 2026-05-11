'use client'

import { useMemo, useState } from 'react'
import type { Subscriber, ConfirmActionState } from './types'
import { formatDate, statusBadge } from './types'
import { useToast } from '../ui/ToastProvider'
import SubscriberDrawer from './SubscriberDrawer'

interface SubscribersTabProps {
  subscribers: Subscriber[]
  setConfirmAction: (action: ConfirmActionState) => void
  loadData: () => void
}

type StatusFilter = 'all' | 'active' | 'pending' | 'blocked'
type ListFilter = 'all' | 'none' | number  // number = listId

export default function SubscribersTab({ subscribers, setConfirmAction, loadData }: SubscribersTabProps) {
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [drawerEmail, setDrawerEmail] = useState<string | null>(null)
  const drawerSubscriber = drawerEmail ? subscribers.find((s) => s.email === drawerEmail) ?? null : null

  // Eindeutige Listen-Eintraege fuer den Filter-Dropdown — Hauptliste zuerst,
  // danach alphabetisch. Aus den Memberships aller Subscriber dedupliziert.
  const allLists = useMemo(() => {
    const map = new Map<number, { id: number; name: string; isPrimary: boolean }>()
    for (const s of subscribers) {
      for (const l of s.lists ?? []) {
        if (!map.has(l.id)) map.set(l.id, l)
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [subscribers])

  const filtered = useMemo(() => subscribers.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (listFilter === 'none' && (s.lists?.length ?? 0) > 0) return false
    if (typeof listFilter === 'number' && !(s.lists ?? []).some((l) => l.id === listFilter)) return false
    return true
  }), [subscribers, statusFilter, listFilter])

  async function postAction(body: object, successMsg: string) {
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Aktion fehlgeschlagen.')
        return
      }
      toast.success(successMsg)
      loadData()
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
    }
  }

  function handleDelete(id: number, email: string) {
    setConfirmAction({
      title: 'Abonnent löschen',
      message: `${email} wirklich löschen? Datensatz wird komplett entfernt — verwende "Abmelden" wenn du den Eintrag behalten willst.`,
      onConfirm: () => {
        setConfirmAction(null)
        postAction({ action: 'delete', subscriberId: id }, 'Abonnent gelöscht.')
      },
    })
  }

  function handleUnsubscribe(id: number, email: string) {
    setConfirmAction({
      title: 'Abonnent abmelden',
      message: `${email} auf "abgemeldet" setzen? Datensatz bleibt erhalten, aber es werden keine Mails mehr verschickt.`,
      onConfirm: () => {
        setConfirmAction(null)
        postAction({ action: 'unsubscribe', subscriberId: id }, 'Abonnent abgemeldet.')
      },
    })
  }

  const filterCount = filtered.length
  const totalCount = subscribers.length

  return (
    <div className="space-y-4">
      {/* Filter-Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Filter:</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
        >
          <option value="all">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="pending">Ausstehend</option>
          <option value="blocked">Blockiert</option>
        </select>
        <select
          value={listFilter === 'all' ? 'all' : listFilter === 'none' ? 'none' : String(listFilter)}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'all') setListFilter('all')
            else if (v === 'none') setListFilter('none')
            else setListFilter(parseInt(v, 10))
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
          disabled={allLists.length === 0}
        >
          <option value="all">Alle Listen</option>
          <option value="none">In keiner Liste</option>
          {allLists.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.isPrimary ? '★ ' : ''}{l.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-[var(--text-secondary)]">
          {filterCount} von {totalCount}
        </span>
      </div>

      <div className="glass-card overflow-hidden rounded-xl">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              {totalCount === 0 ? 'Noch keine Abonnenten.' : 'Keine Treffer mit diesen Filtern.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">E-Mail</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">In Listen</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Angemeldet</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const sBadge = statusBadge[s.status] || statusBadge.pending
                return (
                  <tr
                    key={s.id}
                    onClick={() => setDrawerEmail(s.email)}
                    className={`cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-secondary)] ${
                      i % 2 === 0 ? '' : 'bg-[var(--bg-secondary)]/50'
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-[var(--text)]">{s.email}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {s.firstName ?? <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sBadge.cls}`}>
                        {sBadge.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {s.lists.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.lists.map((l) => (
                            <span
                              key={l.id}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${
                                l.isPrimary
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                              }`}
                              title={l.isPrimary ? 'Hauptliste' : undefined}
                            >
                              {l.isPrimary ? '★ ' : ''}{l.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {s.status !== 'blocked' && (
                        <button
                          onClick={() => handleUnsubscribe(s.id, s.email)}
                          className="mr-2 rounded-md px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20"
                        >
                          Abmelden
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(s.id, s.email)}
                        className="rounded-md px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {drawerSubscriber && (
        <SubscriberDrawer
          subscriber={drawerSubscriber}
          onClose={() => setDrawerEmail(null)}
          onChanged={loadData}
          setConfirmAction={setConfirmAction}
        />
      )}
    </div>
  )
}
