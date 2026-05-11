'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/ToastProvider'
import EngagementPanel from './EngagementPanel'
import { parseDbDate, inputCls } from '@/components/admin/types'
import type { AudienceFilter } from '@/components/admin/types'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'
import { getUsedSlugs, defaultScheduleValue, parseScheduleLocal } from '@/lib/newsletter-block-helpers'

interface ListMeta {
  id: number
  name: string
  member_count: number
}

interface Props {
  draftId: string
}

export default function SendPreflight({ draftId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState<NewsletterDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [availableLists, setAvailableLists] = useState<ListMeta[]>([])

  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter | null>(null)
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduleLocal, setScheduleLocal] = useState<string>(defaultScheduleValue())
  const [useSto, setUseSto] = useState(false)
  const [sending, setSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [draftRes, mainRes, listsRes] = await Promise.all([
          fetch(`/api/admin/newsletter/drafts/${draftId}`),
          fetch('/api/admin/newsletter'),
          fetch('/api/admin/lists'),
        ])
        if (cancelled) return
        if (draftRes.status === 404) { setNotFound(true); return }
        if (!draftRes.ok) throw new Error('draft fetch failed')
        const draftData = await draftRes.json()
        const mainData = mainRes.ok ? await mainRes.json() : { subscribers: [] }
        const listsData = listsRes.ok ? await listsRes.json() : { lists: [] }
        if (cancelled) return
        setDraft(draftData.draft)
        setConfirmedCount(
          Array.isArray(mainData.subscribers)
            ? mainData.subscribers.filter((s: { status: string }) => s.status === 'active').length
            : 0,
        )
        setAvailableLists(
          Array.isArray(listsData.lists)
            ? listsData.lists.map((l: ListMeta) => ({ id: l.id, name: l.name, member_count: l.member_count }))
            : [],
        )
      } catch {
        if (!cancelled) toast.error('Pre-Flight-Daten konnten nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [draftId, toast])

  const usedSlugs = useMemo(() => (draft ? [...getUsedSlugs(draft.blocks)] : []), [draft])

  const selectedList = selectedListId ? availableLists.find((l) => l.id === selectedListId) ?? null : null
  const audienceCount = selectedList
    ? selectedList.member_count
    : (audienceFilter ? audienceFilter.count : confirmedCount)

  const abActive = !!draft?.abTestEnabled && (draft.subjectVariantB?.trim().length ?? 0) > 0
  const canSend =
    !!draft &&
    audienceCount > 0 &&
    !sending &&
    (!abActive || !useSto) &&
    (!abActive || audienceCount >= 2)

  const handleConfirmSend = useCallback(async () => {
    if (!draft) return
    setShowConfirm(false)
    setSending(true)
    try {
      const audiencePayload = !selectedListId && audienceFilter
        ? { tags: audienceFilter.tags, minSignal: audienceFilter.mode === 'high' ? 5 : 1 }
        : undefined
      const listIdPayload = selectedListId ?? undefined
      const scheduledDate = scheduleMode === 'scheduled' ? parseScheduleLocal(scheduleLocal) : null
      if (scheduleMode === 'scheduled' && !scheduledDate) {
        toast.error('Bitte ein gültiges Datum & Uhrzeit wählen.')
        setSending(false)
        return
      }
      if (scheduledDate && scheduledDate.getTime() <= Date.now() + 60_000) {
        toast.error('Geplanter Zeitpunkt muss in der Zukunft liegen.')
        setSending(false)
        return
      }

      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          draftId: draft.id,
          audienceFilter: audiencePayload,
          listId: listIdPayload,
          scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
          useSto: useSto || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Versand fehlgeschlagen.')
        setSending(false)
        return
      }
      if (data.mode?.startsWith('scheduled') && data.scheduledFor) {
        const when = new Date(data.scheduledFor).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })
        toast.success(`Newsletter geplant für ${when} (${data.enqueued} Empfänger).`)
      } else if (data.mode === 'sto') {
        const latest = data.latest ? new Date(data.latest).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '?'
        toast.success(`STO-Versand: ${data.enqueued} Mails geplant (spätestens ${latest}).`)
      } else {
        toast.success('Versand gestartet — Status im Bereich «Verlauf».')
      }
      router.push('/admin/newsletter/send/history')
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
      setSending(false)
    }
  }, [draft, selectedListId, audienceFilter, scheduleMode, scheduleLocal, useSto, router, toast])

  if (loading) {
    return <div className="p-8 text-center text-sm text-[var(--text-muted)]">Lade Pre-Flight…</div>
  }

  if (notFound || !draft) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-sm text-[var(--text-muted)]">Dieser Entwurf existiert nicht oder ist nicht freigegeben.</p>
        <button onClick={() => router.push('/admin/newsletter/send')} className="glass-button">
          Zurück zur Übersicht
        </button>
      </div>
    )
  }

  if (draft.status !== 'ready_to_send') {
    return (
      <div className="p-8 text-center">
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          Status: <span className="font-semibold">{draft.status}</span> — nur freigegebene Entwürfe können versendet werden.
        </p>
        <button onClick={() => router.push('/admin/newsletter/send')} className="glass-button">
          Zurück zur Übersicht
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <button
          onClick={() => router.push('/admin/newsletter/send')}
          className="mb-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          ← Zurück zur Liste
        </button>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{draft.subject || '(Ohne Betreff)'}</h1>
        {draft.preheader && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{draft.preheader}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[var(--text-muted)]">Blöcke: <span className="tabular-nums text-[var(--text)]">{draft.blocks.length}</span></span>
          {abActive && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              A/B-Test aktiv
            </span>
          )}
          {draft.lastTestedAt ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
              ✓ Getestet {parseDbDate(draft.lastTestedAt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}
              {draft.lastTestedTo && <> · {draft.lastTestedTo}</>}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              ⚠ Nicht getestet — im Erstellen-Bereich testen
            </span>
          )}
        </div>
      </header>

      {/* Audience */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Empfänger</h2>
        <EngagementPanel
          slugs={usedSlugs}
          audienceMode={audienceFilter?.mode ?? 'all'}
          onAudienceChange={(f) => { setAudienceFilter(f); if (f) setSelectedListId(null) }}
        />
        {availableLists.length > 0 && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text)]">Empfänger aus Liste</span>
              {selectedListId !== null && (
                <button
                  onClick={() => setSelectedListId(null)}
                  className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text)]"
                >
                  Liste deaktivieren
                </button>
              )}
            </div>
            <select
              value={selectedListId ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setSelectedListId(v === '' ? null : parseInt(v, 10))
                if (v !== '') setAudienceFilter(null)
              }}
              className={inputCls + ' w-full'}
            >
              <option value="">— Alle Abonnenten / Segment —</option>
              {availableLists.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Schedule */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Versand-Zeitpunkt</h2>
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="schedule-mode"
              checked={scheduleMode === 'now'}
              onChange={() => setScheduleMode('now')}
              className="h-4 w-4 cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Sofort senden</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="schedule-mode"
              checked={scheduleMode === 'scheduled'}
              onChange={() => setScheduleMode('scheduled')}
              className="h-4 w-4 cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Geplant senden</span>
          </label>
          {scheduleMode === 'scheduled' && (
            <input
              type="datetime-local"
              value={scheduleLocal}
              onChange={(e) => setScheduleLocal(e.target.value)}
              className={inputCls + ' mt-2 max-w-xs'}
            />
          )}
          {!abActive && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 border-t border-[var(--border)] pt-3">
              <input
                type="checkbox"
                checked={useSto}
                onChange={(e) => setUseSto(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <span className="text-sm text-[var(--text)]">
                Send-Time-Optimization
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  Pro Empfänger zur optimalen Stunde versenden
                </span>
              </span>
            </label>
          )}
        </div>
      </section>

      {/* Summary + Send */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4">
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">Empfänger</dt>
            <dd className="tabular-nums text-[var(--text)]">
              {audienceCount}
              {selectedList ? <span className="text-[var(--text-muted)]"> · Liste «{selectedList.name}»</span>
                : audienceFilter ? <span className="text-[var(--text-muted)]"> · Segment</span>
                : <span className="text-[var(--text-muted)]"> · alle bestätigten Abos</span>}
            </dd>
          </div>
          <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">Zeitpunkt</dt>
            <dd className="text-[var(--text)]">
              {scheduleMode === 'scheduled'
                ? (parseScheduleLocal(scheduleLocal)?.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) ?? '— ungültig —')
                : 'Sofort'}
              {useSto && <span className="text-[var(--text-muted)]"> · mit STO</span>}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!canSend}
          className="w-full rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending
            ? (scheduleMode === 'scheduled' ? 'Wird geplant…' : 'Wird versendet…')
            : `${scheduleMode === 'scheduled' ? 'Versand planen' : 'Jetzt senden'} • ${audienceCount} Empfänger`}
        </button>
        {!draft.lastTestedAt && (
          <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
            Achtung: Dieser Entwurf wurde noch nicht per Test-Mail geprüft.
          </p>
        )}
      </section>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">
              {scheduleMode === 'scheduled' ? 'Versand planen?' : 'Jetzt versenden?'}
            </h3>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              Newsletter geht an <span className="font-semibold">{audienceCount}</span>{' '}
              Empfänger. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="glass-button">Abbrechen</button>
              <button
                onClick={handleConfirmSend}
                className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {scheduleMode === 'scheduled' ? 'Planen' : 'Senden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
