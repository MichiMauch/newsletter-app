'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface UpcomingSend {
  id: number
  subject: string
  scheduledFor: string
  recipientCount: number
}

interface TodayPayload {
  newSubscribersToday: number
  unsubscribedToday: number
  bouncesToday: number
  upcomingSends: UpcomingSend[]
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleString('de-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function DashboardTodayBlock() {
  const [data, setData] = useState<TodayPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/today', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((payload: TodayPayload | null) => {
        if (cancelled) return
        if (payload) setData(payload)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="glass-card flex items-center gap-2 p-4 text-sm text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 animate-pulse bg-[var(--text-muted)]" />
        Lade „Heute“ …
      </div>
    )
  }

  if (!data) return null

  const items: TodayItem[] = [
    {
      key: 'new-subs',
      label: 'Neue Abos heute',
      count: data.newSubscribersToday,
      href: '/admin/newsletter/subscribers',
      tone: data.newSubscribersToday > 0 ? 'positive' : 'neutral',
    },
    {
      key: 'unsubs',
      label: 'Abmeldungen heute',
      count: data.unsubscribedToday,
      href: '/admin/newsletter/subscribers',
      tone: data.unsubscribedToday > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'bounces',
      label: 'Bounces heute',
      count: data.bouncesToday,
      href: '/admin/newsletter/send/bounces',
      tone: data.bouncesToday > 0 ? 'negative' : 'neutral',
    },
  ]

  const hasAnything =
    items.some((it) => it.count > 0) || data.upcomingSends.length > 0

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Heute
        </h3>
        {!hasAnything && (
          <span className="text-xs text-[var(--text-muted)]">Alles ruhig.</span>
        )}
      </div>

      <div className="grid gap-px bg-[var(--border)] sm:grid-cols-3">
        {items.map((it) => <TodayCounter key={it.key} item={it} />)}
      </div>

      {data.upcomingSends.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Geplant in den nächsten 24 h
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {data.upcomingSends.map((s) => (
              <li key={s.id}>
                <Link
                  href="/admin/newsletter/send/history"
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <svg className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="truncate text-[var(--text)]">{s.subject}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-secondary)] tabular-nums">
                    {formatTime(s.scheduledFor)} · {s.recipientCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface TodayItem {
  key: string
  label: string
  count: number
  href: string
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
}

function TodayCounter({ item }: { item: TodayItem }) {
  const colour =
    item.count === 0
      ? 'text-[var(--text-muted)]'
      : item.tone === 'positive'
        ? 'text-emerald-600 dark:text-emerald-400'
        : item.tone === 'negative'
          ? 'text-red-600 dark:text-red-400'
          : item.tone === 'warning'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-[var(--text)]'

  return (
    <Link
      href={item.href}
      className="group flex items-baseline justify-between bg-[var(--background-card)] px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
    >
      <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text)]">
        {item.label}
      </span>
      <span
        className={`tabular-nums ${colour}`}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}
      >
        {item.count}
      </span>
    </Link>
  )
}
