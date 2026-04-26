'use client'

import { useEffect, useState } from 'react'

interface StatusPayload {
  resendConfigured: boolean
  confirmedSubscribers: number
  nextScheduledSend: {
    id: number
    subject: string
    scheduledFor: string
    recipientCount: number
  } | null
}

const REFRESH_INTERVAL = 30_000

function formatNextSend(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `heute ${d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) {
    return `morgen ${d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleString('de-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function StatusPill() {
  const [data, setData] = useState<StatusPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/admin/status', { cache: 'no-store' })
        if (!res.ok) return
        const payload = (await res.json()) as StatusPayload
        if (!cancelled) {
          setData(payload)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const handle = setInterval(load, REFRESH_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--background-card)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 animate-pulse bg-[var(--text-muted)]" />
        <span>Lade Status …</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[var(--border)] bg-[var(--background-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <span
        className="flex items-center gap-1.5"
        title={data.resendConfigured ? 'RESEND_API_KEY ist gesetzt.' : 'RESEND_API_KEY fehlt — Mails können nicht versendet werden.'}
      >
        <span
          className={`h-1.5 w-1.5 ${data.resendConfigured ? 'bg-emerald-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <span>Resend {data.resendConfigured ? 'verbunden' : 'fehlt'}</span>
      </span>

      <span className="text-[var(--text-muted)]" aria-hidden>·</span>

      <a
        href="/admin/newsletter/subscribers"
        className="tabular-nums text-[var(--text)] transition-colors hover:text-primary-600 dark:hover:text-primary-400"
      >
        {data.confirmedSubscribers.toLocaleString('de-CH')}{' '}
        <span className="text-[var(--text-secondary)]">aktive Abos</span>
      </a>

      <span className="text-[var(--text-muted)]" aria-hidden>·</span>

      {data.nextScheduledSend ? (
        <a
          href="/admin/newsletter/send/history"
          className="flex items-center gap-1.5 text-[var(--text)] transition-colors hover:text-primary-600 dark:hover:text-primary-400"
          title={data.nextScheduledSend.subject}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Nächster Send: {formatNextSend(data.nextScheduledSend.scheduledFor)}</span>
        </a>
      ) : (
        <span className="text-[var(--text-muted)]">Kein Send geplant</span>
      )}
    </div>
  )
}
