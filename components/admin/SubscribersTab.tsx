'use client'

import type { Subscriber, ConfirmActionState, ToastState } from './types'
import { formatDate, statusBadge } from './types'

interface SubscribersTabProps {
  subscribers: Subscriber[]
  setConfirmAction: (action: ConfirmActionState) => void
  setToast: (toast: ToastState) => void
  loadData: () => void
}

export default function SubscribersTab({ subscribers, setConfirmAction, setToast, loadData }: SubscribersTabProps) {
  function handleDeleteSubscriber(id: number) {
    setConfirmAction({
      title: 'Abonnent löschen',
      message: 'Abonnent wirklich löschen?',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          const res = await fetch('/api/admin/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', subscriberId: id }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setToast({ type: 'error', message: data.error || 'Löschen fehlgeschlagen.' })
            return
          }
          setToast({ type: 'success', message: 'Abonnent gelöscht.' })
          loadData()
        } catch {
          setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
        }
      },
    })
  }

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      {subscribers.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <svg className="mx-auto h-10 w-10 text-[var(--text-secondary)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77A5.98 5.98 0 0112 15.07m3 4.058a6.042 6.042 0 00-.786-3.07M12 15.07a5.98 5.98 0 00-1.654-.76M12 15.07V12m0 0a3 3 0 10-5.696-1.34" />
          </svg>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">Noch keine Abonnenten.</p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">E-Mail</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Datum</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s, i) => {
              const badge = statusBadge[s.status] || statusBadge.pending
              return (
                <tr
                  key={s.id}
                  className={`border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-secondary)] ${
                    i % 2 === 0 ? '' : 'bg-[var(--bg-secondary)]/50'
                  }`}
                >
                  <td className="px-5 py-3 font-medium text-[var(--text)]">{s.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDeleteSubscriber(s.id)}
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
  )
}
