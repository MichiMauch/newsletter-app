'use client'

import { useMemo, useState } from 'react'
import type { Subscriber, ConfirmActionState, ToastState } from './types'
import { formatDate, statusBadge, tierBadge } from './types'

interface SubscribersTabProps {
  subscribers: Subscriber[]
  setConfirmAction: (action: ConfirmActionState) => void
  setToast: (toast: ToastState) => void
  loadData: () => void
}

type StatusFilter = 'all' | 'confirmed' | 'pending' | 'unsubscribed'
type TierFilter = 'all' | 'active' | 'moderate' | 'dormant' | 'cold' | 'no-data'

export default function SubscribersTab({ subscribers, setConfirmAction, setToast, loadData }: SubscribersTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')

  const allTags = useMemo(() => {
    const set = new Set<string>()
    subscribers.forEach((s) => s.tags?.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [subscribers])

  const filtered = useMemo(() => subscribers.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (tierFilter === 'no-data' && s.engagement_tier) return false
    if (tierFilter !== 'all' && tierFilter !== 'no-data' && s.engagement_tier !== tierFilter) return false
    if (tagFilter !== 'all' && !(s.tags ?? []).includes(tagFilter)) return false
    return true
  }), [subscribers, statusFilter, tierFilter, tagFilter])

  async function postAction(body: object, successMsg: string) {
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ type: 'error', message: data.error || 'Aktion fehlgeschlagen.' })
        return
      }
      setToast({ type: 'success', message: successMsg })
      loadData()
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
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
          <option value="confirmed">Bestätigt</option>
          <option value="pending">Ausstehend</option>
          <option value="unsubscribed">Abgemeldet</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as TierFilter)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
        >
          <option value="all">Alle Tiers</option>
          <option value="active">Aktiv</option>
          <option value="moderate">Mässig</option>
          <option value="dormant">Schlafend</option>
          <option value="cold">Kalt</option>
          <option value="no-data">Ohne Score</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
          disabled={allTags.length === 0}
        >
          <option value="all">Alle Tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
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
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Engagement</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Tags</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Datum</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const sBadge = statusBadge[s.status] || statusBadge.pending
                const tBadge = s.engagement_tier ? tierBadge[s.engagement_tier] : null
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-secondary)] ${
                      i % 2 === 0 ? '' : 'bg-[var(--bg-secondary)]/50'
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-[var(--text)]">{s.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sBadge.cls}`}>
                        {sBadge.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {tBadge ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tBadge.cls}`}>
                          {tBadge.label} ({s.engagement_score ?? 0})
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {s.tags && s.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.tags.map((t) => (
                            <span key={t} className="inline-flex rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {s.status !== 'unsubscribed' && (
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
    </div>
  )
}
