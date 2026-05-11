'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/ToastProvider'
import { parseDbDate } from '@/components/admin/types'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '–'
  const d = parseDbDate(dateStr)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'gerade eben'
  if (diff < 3600_000) return `vor ${Math.floor(diff / 60_000)} Min.`
  if (diff < 86_400_000) return `vor ${Math.floor(diff / 3_600_000)} Std.`
  return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}

export default function ReadyToSendList() {
  const toast = useToast()
  const router = useRouter()
  const [drafts, setDrafts] = useState<NewsletterDraft[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/newsletter/drafts?status=ready_to_send')
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setDrafts(data.drafts ?? [])
    } catch {
      toast.error('Drafts konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleReopen = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${id}/reopen`, { method: 'POST' })
      if (!res.ok) throw new Error('reopen failed')
      router.push(`/admin/newsletter/compose/${id}`)
    } catch {
      toast.error('Wieder öffnen fehlgeschlagen.')
    }
  }, [router, toast])

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Bereit zum Senden</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Finalisierte Entwürfe — wähle einen aus, um Empfänger und Versand-Zeit festzulegen.
          </p>
        </div>
        <Link
          href="/admin/newsletter/compose"
          className="text-sm text-primary-600 hover:underline"
        >
          Neuen Entwurf erstellen →
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-8 text-center text-sm text-[var(--text-muted)]">
          Lade…
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--background-card)] p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Aktuell keine finalisierten Entwürfe.
          </p>
          <Link
            href="/admin/newsletter/compose"
            className="mt-4 inline-block rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
          >
            Zum Erstellungs-Bereich
          </Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-card)]">
          {drafts.map((draft) => {
            const title = draft.title?.trim() || draft.subject?.trim() || '(Ohne Titel)'
            const tested = !!draft.lastTestedAt
            return (
              <li key={draft.id} className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--text)]">{title}</span>
                    {tested ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        Getestet
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        Nicht getestet
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Freigegeben {formatRelative(draft.finalizedAt)}
                    {tested && draft.lastTestedTo && (
                      <> · zuletzt an <span className="font-mono">{draft.lastTestedTo}</span> {formatRelative(draft.lastTestedAt)}</>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReopen(draft.id)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--background-elevated)]"
                  >
                    Wieder öffnen
                  </button>
                  <Link
                    href={`/admin/newsletter/send/${draft.id}`}
                    className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90"
                  >
                    Senden →
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
