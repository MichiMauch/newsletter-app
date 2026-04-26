'use client'

import { useEffect, useState } from 'react'
import { formatDate } from './types'

interface BounceBreakdownRow {
  bounce_type: string | null
  bounce_sub_type: string | null
  count: number
  unique_emails: number
}

interface BouncedAddressRow {
  email: string
  bounce_count: number
  last_bounced_at: string
  last_bounce_type: string | null
  last_bounce_sub_type: string | null
  last_bounce_message: string | null
  last_source: 'newsletter' | 'automation'
  newsletter_bounces: number
  automation_bounces: number
  subscriber_status: 'pending' | 'confirmed' | 'unsubscribed' | null
}

interface BounceOverview {
  total_bounces: number
  unique_addresses: number
  newsletter_bounces: number
  automation_bounces: number
  by_subtype: BounceBreakdownRow[]
  addresses: BouncedAddressRow[]
}

const subTypeLabel: Record<string, string> = {
  General: 'Allgemein',
  NoEmail: 'Adresse existiert nicht',
  Suppressed: 'Gesperrt (Resend)',
  MailboxFull: 'Postfach voll',
  MessageTooLarge: 'Nachricht zu gross',
  ContentRejected: 'Inhalt abgelehnt',
  AttachmentRejected: 'Anhang abgelehnt',
  OnAccountSuppressionList: 'Auf Account-Sperrliste',
}

function formatSubtype(sub: string | null): string {
  if (!sub) return 'Unbekannt'
  return subTypeLabel[sub] ?? sub
}

const typeBadge: Record<string, string> = {
  Permanent: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  Transient: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  Undetermined: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
}

export default function BouncesTab() {
  const [data, setData] = useState<BounceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterSubType, setFilterSubType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/newsletter?bounces=1')
        const json = await res.json()
        if (!cancelled) setData(json.bounceOverview ?? null)
      } catch (err) {
        console.error('Failed to load bounces:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="glass-card rounded-xl p-6 text-center text-[var(--text-secondary)]">Bounces werden geladen…</div>
  }

  if (!data || data.total_bounces === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <div className="text-[var(--text)] font-medium">Keine Bounces</div>
        <div className="mt-1 text-sm text-[var(--text-secondary)]">Bisher sind keine Newsletter-Mails als Bounce zurückgekommen.</div>
      </div>
    )
  }

  const visibleAddresses = filterSubType
    ? data.addresses.filter((a) => (a.last_bounce_sub_type ?? null) === (filterSubType === '__none__' ? null : filterSubType))
    : data.addresses

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text)]">Bounces im Adressstamm</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Welche Adressen haben Mails abgelehnt – und warum. Quelle: Resend Webhook.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="glass-card rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{data.total_bounces}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Bounces gesamt</div>
        </div>
        <div className="glass-card rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-[var(--text)]">{data.unique_addresses}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Betroffene Adressen</div>
        </div>
        <div className="glass-card rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-[var(--text)]">{data.newsletter_bounces}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Aus Newsletter</div>
        </div>
        <div className="glass-card rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-[var(--text)]">{data.automation_bounces}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Aus Automation</div>
        </div>
      </div>

      {/* Verteilung nach Sub-Type */}
      <div className="glass-card overflow-hidden rounded-xl">
        <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
          <h4 className="font-medium text-[var(--text)]">Verteilung nach Bounce-Art</h4>
          {filterSubType && (
            <button
              onClick={() => setFilterSubType(null)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Typ</th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Sub-Type</th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Bounces</th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Adressen</th>
            </tr>
          </thead>
          <tbody>
            {data.by_subtype.map((b, i) => {
              const subKey = b.bounce_sub_type ?? '__none__'
              const isActive = filterSubType === subKey
              const cls = typeBadge[b.bounce_type ?? ''] ?? 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
              return (
                <tr
                  key={i}
                  onClick={() => setFilterSubType(isActive ? null : subKey)}
                  className={`cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-secondary)] ${isActive ? 'bg-[var(--bg-secondary)]' : ''}`}
                >
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
                      {b.bounce_type ?? 'Unbekannt'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--text)]">{formatSubtype(b.bounce_sub_type)}</td>
                  <td className="px-5 py-3 text-right text-[var(--text)]">{b.count}</td>
                  <td className="px-5 py-3 text-right text-[var(--text-secondary)]">{b.unique_emails}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Adressliste */}
      <div className="glass-card overflow-hidden rounded-xl">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h4 className="font-medium text-[var(--text)]">
            Betroffene Adressen
            {filterSubType && (
              <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                · gefiltert: {formatSubtype(filterSubType === '__none__' ? null : filterSubType)}
              </span>
            )}
          </h4>
        </div>
        {visibleAddresses.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Keine Adressen für diesen Filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">E-Mail</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Letzter Bounce</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Art</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Diagnose</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Anzahl</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Quelle</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleAddresses.map((a) => {
                  const cls = typeBadge[a.last_bounce_type ?? ''] ?? 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                  return (
                    <tr key={a.email} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-5 py-3 text-[var(--text)] font-medium">{a.email}</td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(a.last_bounced_at)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
                          {a.last_bounce_type ?? '?'}
                        </span>
                        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{formatSubtype(a.last_bounce_sub_type)}</div>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)] max-w-md">
                        {a.last_bounce_message ? (
                          <span className="block truncate" title={a.last_bounce_message}>{a.last_bounce_message}</span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--text)]">
                        {a.bounce_count}
                        {a.newsletter_bounces > 0 && a.automation_bounces > 0 && (
                          <div className="text-[10px] text-[var(--text-secondary)]">
                            {a.newsletter_bounces} NL · {a.automation_bounces} Auto
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                        {a.last_source === 'automation' ? 'Automation' : 'Newsletter'}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                        {a.subscriber_status === 'confirmed'
                          ? <span className="text-emerald-600 dark:text-emerald-400">aktiv</span>
                          : a.subscriber_status === 'unsubscribed'
                            ? 'abgemeldet'
                            : a.subscriber_status === 'pending'
                              ? 'ausstehend'
                              : 'nicht im Stamm'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
