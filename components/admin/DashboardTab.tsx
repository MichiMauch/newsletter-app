'use client'

import Link from 'next/link'
import type { Subscriber, NewsletterSend, OverallStatsData, SendTrend, SubscriberGrowth, Tab } from './types'
import { formatDate } from './types'

interface DashboardTabProps {
  subscribers: Subscriber[]
  sends: NewsletterSend[]
  overallStats: OverallStatsData | null
  subscriberGrowth: SubscriberGrowth[]
  sendTrends: SendTrend[]
  setTab: (tab: Tab) => void
  EngagementTrendChart: React.ComponentType<{ trends: SendTrend[] }>
  SubscriberGrowthChart: React.ComponentType<{ data: SubscriberGrowth[] }>
}

export default function DashboardTab({
  subscribers,
  sends,
  overallStats,
  subscriberGrowth,
  sendTrends,
  setTab,
  EngagementTrendChart,
  SubscriberGrowthChart,
}: DashboardTabProps) {
  const confirmedCount = subscribers.filter((s) => s.status === 'confirmed').length

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button onClick={() => setTab('subscribers')} className="glass-card p-5 text-left transition-colors hover:border-[var(--text-secondary)]">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--color-primary)' }}>{confirmedCount}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Abonnenten</div>
        </button>
        <button onClick={() => setTab('history')} className="glass-card p-5 text-left transition-colors hover:border-[var(--text-secondary)]">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text)' }}>{sends.length}</div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Versendet</div>
        </button>
        <button onClick={() => setTab('history')} className="glass-card p-5 text-left transition-colors hover:border-[var(--text-secondary)]">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            {overallStats ? `${overallStats.avg_click_rate}%` : '—'}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Ø Klickrate</div>
        </button>
        <button onClick={() => setTab('automations')} className="glass-card p-5 text-left transition-colors hover:border-[var(--text-secondary)]">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            {subscribers.filter((s) => s.status === 'pending').length}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Ausstehend</div>
        </button>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {subscriberGrowth.length >= 2 && <div className="lg:col-span-2"><SubscriberGrowthChart data={subscriberGrowth} /></div>}
        {sendTrends.length >= 2 && <div className="lg:col-span-2"><EngagementTrendChart trends={sendTrends} /></div>}
      </div>

      {/* Quick Actions + Recent Sends */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <div className="glass-card p-5">
          <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Schnellzugriffe</h3>
          <div className="space-y-2">
            <Link href="/admin/newsletter/compose" className="flex w-full items-center gap-3 border border-[var(--border)] p-3 text-left text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--text-secondary)]">
              <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
              Newsletter erstellen
            </Link>
            <Link href="/admin/newsletter/subscribers" className="flex w-full items-center gap-3 border border-[var(--border)] p-3 text-left text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--text-secondary)]">
              <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77" /></svg>
              Abonnenten verwalten
            </Link>
            <Link href="/admin/newsletter/automations" className="flex w-full items-center gap-3 border border-[var(--border)] p-3 text-left text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--text-secondary)]">
              <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
              Automationen
            </Link>
          </div>
        </div>

        {/* Recent Sends */}
        <div className="glass-card p-5">
          <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Letzte Newsletter</h3>
          {sends.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Noch keine Newsletter versendet.</p>
          ) : (
            <div className="space-y-2">
              {sends.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setTab('history')}
                  className="flex w-full items-center justify-between border border-[var(--border)] p-3 text-left transition-colors hover:border-[var(--text-secondary)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--text)] truncate">{s.subject}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{formatDate(s.sent_at)} · {s.recipient_count} Empfänger</div>
                  </div>
                  {(s.clicked_count ?? 0) > 0 && (
                    <span className="ml-2 text-xs text-primary-600">{s.clicked_count} Klicks</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
