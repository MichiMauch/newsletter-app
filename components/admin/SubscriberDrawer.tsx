'use client'

import { useEffect, useRef, useState } from 'react'
import type { Subscriber, ConfirmActionState } from './types'
import { formatDate, statusBadge } from './types'
import { EngagementBadge } from '../ui/EngagementIndicator'
import { useToast } from '../ui/ToastProvider'

interface ProfilePayload {
  subscriber: {
    id: number
    email: string
    status: 'pending' | 'confirmed' | 'unsubscribed'
    createdAt: string
    confirmedAt: string | null
    unsubscribedAt: string | null
  }
  engagement: {
    score: number
    tier: 'active' | 'moderate' | 'dormant' | 'cold'
    sends_90d: number
    opens_90d: number
    clicks_90d: number
    last_open_at: string | null
    last_click_at: string | null
  } | null
  tags: string[]
  lists: { id: number; name: string }[]
  sends: {
    id: number
    sendId: number
    subject: string
    sent_at: string
    status: 'sent' | 'delivered' | 'clicked' | 'bounced' | 'complained'
    click_count: number
    bounce_type: string | null
  }[]
}

interface SubscriberDrawerProps {
  subscriber: Subscriber
  onClose: () => void
  onChanged: () => void
  setConfirmAction: (action: ConfirmActionState) => void
}

const sendStatusLabels: Record<ProfilePayload['sends'][number]['status'], { label: string; cls: string }> = {
  sent: { label: 'Gesendet', cls: 'text-[var(--text-muted)]' },
  delivered: { label: 'Zugestellt', cls: 'text-blue-600 dark:text-blue-400' },
  clicked: { label: 'Geklickt', cls: 'text-emerald-600 dark:text-emerald-400' },
  bounced: { label: 'Bounced', cls: 'text-red-600 dark:text-red-400' },
  complained: { label: 'Beschwerde', cls: 'text-orange-600 dark:text-orange-400' },
}

export default function SubscriberDrawer({ subscriber, onClose, onChanged, setConfirmAction }: SubscriberDrawerProps) {
  const toast = useToast()
  const [profile, setProfile] = useState<ProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newTag, setNewTag] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/subscriber?email=${encodeURIComponent(subscriber.email)}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data: ProfilePayload | null) => {
        if (cancelled) return
        if (data) setProfile(data)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [subscriber.email])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  async function refresh() {
    const res = await fetch(`/api/admin/subscriber?email=${encodeURIComponent(subscriber.email)}`, { cache: 'no-store' })
    if (res.ok) setProfile(await res.json())
  }

  async function handleAddTag(tag: string) {
    const value = tag.trim()
    if (!value) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/subscriber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-tag', email: subscriber.email, tag: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Tag konnte nicht hinzugefügt werden.')
      toast.success(`Tag «${value}» hinzugefügt.`)
      setNewTag('')
      await refresh()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(false)
      tagInputRef.current?.focus()
    }
  }

  async function handleRemoveTag(tag: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/subscriber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-tag', email: subscriber.email, tag }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Tag konnte nicht entfernt werden.')
      }
      toast.success(`Tag «${tag}» entfernt.`)
      await refresh()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  function handleUnsubscribe() {
    setConfirmAction({
      title: 'Abmelden',
      message: `${subscriber.email} aus dem Newsletter abmelden? Datensatz bleibt für die Historie erhalten.`,
      onConfirm: async () => {
        setConfirmAction(null)
        setBusy(true)
        try {
          const res = await fetch('/api/admin/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe', subscriberId: subscriber.id }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Abmeldung fehlgeschlagen.')
          }
          toast.success(`${subscriber.email} abgemeldet.`)
          await refresh()
          onChanged()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Fehler')
        } finally {
          setBusy(false)
        }
      },
    })
  }

  function handleDelete() {
    setConfirmAction({
      title: 'Abonnent löschen',
      message: `${subscriber.email} endgültig löschen? Datensatz wird komplett entfernt — verwende „Abmelden" wenn du die Historie behalten willst.`,
      onConfirm: async () => {
        setConfirmAction(null)
        setBusy(true)
        try {
          const res = await fetch('/api/admin/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', subscriberId: subscriber.id }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Löschen fehlgeschlagen.')
          }
          toast.success(`${subscriber.email} gelöscht.`)
          onChanged()
          onClose()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Fehler')
          setBusy(false)
        }
      },
    })
  }

  const sBadge = statusBadge[subscriber.status] ?? statusBadge.pending

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Abonnent-Details">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <aside className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text)]">{subscriber.email}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium ${sBadge.cls}`}>
                {sBadge.label}
              </span>
              <EngagementBadge tier={profile?.engagement?.tier ?? subscriber.engagement_tier} score={profile?.engagement?.score ?? subscriber.engagement_score} />
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Schliessen"
            className="-m-1 p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">Lade Profil …</div>
          ) : !profile ? (
            <div className="px-5 py-10 text-center text-sm text-red-600 dark:text-red-400">Profil konnte nicht geladen werden.</div>
          ) : (
            <div className="space-y-6 p-5">
              <Section title="Anmeldung">
                <KV label="Angemeldet" value={formatDate(profile.subscriber.createdAt)} />
                <KV label="Bestätigt" value={profile.subscriber.confirmedAt ? formatDate(profile.subscriber.confirmedAt) : '—'} />
                {profile.subscriber.unsubscribedAt && (
                  <KV label="Abgemeldet" value={formatDate(profile.subscriber.unsubscribedAt)} />
                )}
              </Section>

              {profile.engagement && (
                <Section title="Engagement (90 Tage)">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Sends" value={profile.engagement.sends_90d} />
                    <Stat label="Opens" value={profile.engagement.opens_90d} />
                    <Stat label="Klicks" value={profile.engagement.clicks_90d} />
                  </div>
                  {(profile.engagement.last_open_at || profile.engagement.last_click_at) && (
                    <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                      {profile.engagement.last_open_at && <div>Letzter Open: {formatDate(profile.engagement.last_open_at)}</div>}
                      {profile.engagement.last_click_at && <div>Letzter Klick: {formatDate(profile.engagement.last_click_at)}</div>}
                    </div>
                  )}
                </Section>
              )}

              <Section title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {profile.tags.length === 0 ? (
                    <span className="text-xs text-[var(--text-muted)]">Keine Tags.</span>
                  ) : (
                    profile.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text)]">
                        {t}
                        <button
                          onClick={() => handleRemoveTag(t)}
                          disabled={busy}
                          aria-label={`Tag ${t} entfernen`}
                          className="-mr-0.5 ml-0.5 text-[var(--text-muted)] transition-colors hover:text-red-500 disabled:opacity-50"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleAddTag(newTag)
                  }}
                >
                  <input
                    ref={tagInputRef}
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Neuer Tag …"
                    disabled={busy}
                    className="flex-1 border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-primary-400"
                  />
                  <button
                    type="submit"
                    disabled={busy || !newTag.trim()}
                    className="border border-[var(--border)] bg-[var(--background-card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                  >
                    Hinzufügen
                  </button>
                </form>
              </Section>

              <Section title="Listen">
                {profile.lists.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">In keiner manuellen Liste.</p>
                ) : (
                  <ul className="space-y-1">
                    {profile.lists.map((l) => (
                      <li key={l.id} className="text-sm text-[var(--text)]">{l.name}</li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={`Newsletter-Historie (${profile.sends.length})`}>
                {profile.sends.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Noch keinen Newsletter erhalten.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {profile.sends.map((s) => {
                      const meta = sendStatusLabels[s.status]
                      return (
                        <li key={s.id} className="py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-[var(--text)]">{s.subject}</div>
                              <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                                {formatDate(s.sent_at)}
                                {s.click_count > 0 && ` · ${s.click_count} Klick${s.click_count === 1 ? '' : 's'}`}
                                {s.bounce_type && ` · ${s.bounce_type}`}
                              </div>
                            </div>
                            <span className={`shrink-0 text-xs ${meta.cls}`}>{meta.label}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--background-card)] px-5 py-3">
          {profile?.subscriber.status !== 'unsubscribed' && (
            <button
              onClick={handleUnsubscribe}
              disabled={busy}
              className="border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Abmelden
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={busy}
            className="ml-auto border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            Löschen
          </button>
        </footer>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</h3>
      {children}
    </section>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-right text-[var(--text)] tabular-nums">{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--background-card)] p-3 text-center">
      <div className="tabular-nums text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
    </div>
  )
}
