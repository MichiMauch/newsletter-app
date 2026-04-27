'use client'

import { useState } from 'react'
import EngagementTrendChart from './charts/EngagementTrendChart'
import SubscriberGrowthChart from './charts/SubscriberGrowthChart'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import type { SiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import type { VariantStats } from '@/lib/newsletter-variants'
import type {
  NewsletterSend, Post, SendTrend, SubscriberGrowth,
  OverallStatsData, NewsletterRecipientRow, LinkClickRow,
} from './types'
import { formatDate } from './types'
import { useToast } from '../ui/ToastProvider'
import { EngagementDot } from '../ui/EngagementIndicator'
import { ClickHeatmap, ClickHeatmapList } from './history/ClickHeatmap'

const RECIPIENT_BADGE: Record<NewsletterRecipientRow['status'], { label: string; cls: string }> = {
  sent: { label: 'Gesendet', cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]' },
  delivered: { label: 'Zugestellt', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  clicked: { label: 'Geklickt', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
  bounced: { label: 'Bounced', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
  complained: { label: 'Beschwerde', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
}

interface HistoryTabProps {
  sends: NewsletterSend[]
  posts: Post[]
  sendTrends: SendTrend[]
  subscriberGrowth: SubscriberGrowth[]
  overallStats: OverallStatsData | null
  siteConfig: SiteConfig
  loadData: () => void
  streamingSend: (body: object, onProgress: (data: { sent: number; total: number; remaining: number }) => void) => Promise<{ sent: number; total: number }>
}

export default function HistoryTab({
  sends, posts, sendTrends, subscriberGrowth, overallStats,
  siteConfig, loadData, streamingSend,
}: HistoryTabProps) {
  const toast = useToast()
  const [selectedSend, setSelectedSend] = useState<NewsletterSend | null>(null)
  const [sendRecipients, setSendRecipients] = useState<NewsletterRecipientRow[]>([])
  const [sendLinkClicks, setSendLinkClicks] = useState<LinkClickRow[]>([])
  const [sendBlocksJson, setSendBlocksJson] = useState<string | null>(null)
  const [sendVariants, setSendVariants] = useState<VariantStats[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryConfirm, setRetryConfirm] = useState(false)
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const scheduledSends = sends.filter((s) => s.status === 'scheduled')
  const visibleSends = sends.filter((s) => s.status !== 'scheduled')

  async function handleCancelScheduled(send: NewsletterSend) {
    setCancelling(true)
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-scheduled', sendId: send.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Abbrechen fehlgeschlagen.')
      const totalCancelled = (data.cancelled_pending ?? 0) + (data.cancelled_pushed ?? 0)
      const failed = data.failed_pushed ?? 0
      let msg = `Geplanter Versand abgebrochen (${totalCancelled} Empfänger gestoppt).`
      if (data.cancelled_pushed > 0) {
        msg += ` Davon ${data.cancelled_pushed} bei Resend storniert.`
      }
      if (failed > 0) {
        msg += ` ⚠ ${failed} Mails konnten nicht mehr storniert werden – sind möglicherweise schon raus.`
      }
      toast.toast(failed > 0 ? 'info' : 'success', msg)
      setCancelConfirmId(null)
      await loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setCancelling(false)
    }
  }

  async function loadSendDetail(send: NewsletterSend) {
    setSelectedSend(send)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/newsletter?sendDetail=${send.id}`)
      const json = await res.json()
      setSendRecipients(json.sendDetail?.recipients ?? [])
      setSendLinkClicks(json.sendDetail?.linkClicks ?? [])
      setSendBlocksJson(json.sendDetail?.blocksJson ?? null)
      setSendVariants(json.sendDetail?.variants ?? [])
    } catch (err) {
      console.error('Failed to load send detail:', err)
    }
    setLoadingDetail(false)
  }

  async function handleRetryFailed(send: NewsletterSend) {
    const failedCount = sendRecipients.filter((r) => r.status === 'sent').length
    if (failedCount === 0) {
      toast.info('Keine fehlgeschlagenen Empfänger.')
      return
    }
    if (!retryConfirm) { setRetryConfirm(true); return }
    setRetryConfirm(false)
    setRetrying(true)
    try {
      const result = await streamingSend(
        { action: 'retry-failed', sendId: send.id },
        ({ sent, total }) => toast.info(`${sent} von ${total} nachgesendet…`)
      )
      if (result.sent > 0) toast.success(`${result.sent} erfolgreich nachgesendet.`)
      await loadSendDetail(send)
      await loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    }
    setRetrying(false)
  }

  return (
    <div className="space-y-6">
      {/* KPI Dashboard */}
      {overallStats && overallStats.total_sends > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-xl p-5 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{overallStats.avg_click_rate}%</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Klickrate</div>
          </div>
          <div className="glass-card rounded-xl p-5 text-center">
            <div className={`text-2xl font-bold ${overallStats.avg_bounce_rate > 2 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{overallStats.avg_bounce_rate}%</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Bounce-Rate</div>
          </div>
          <div className="glass-card rounded-xl p-5 text-center">
            <div className={`text-2xl font-bold ${overallStats.total_complaints > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{overallStats.total_complaints}</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">Beschwerden</div>
          </div>
        </div>
      )}

      {/* Trend Charts */}
      {!selectedSend && (
        <div className="grid gap-6 lg:grid-cols-2">
          {sendTrends.length >= 2 && <div className="lg:col-span-2"><EngagementTrendChart trends={sendTrends} /></div>}
          {subscriberGrowth.length >= 2 && <div className="lg:col-span-2"><SubscriberGrowthChart data={subscriberGrowth} /></div>}
        </div>
      )}

      {/* Detail View */}
      {selectedSend ? (
        <div className="space-y-6">
          <button onClick={() => { setSelectedSend(null); setSendRecipients([]); setSendLinkClicks([]); setSendBlocksJson(null); setSendVariants([]) }} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors">
            <span>←</span> Zurück zur Übersicht
          </button>

          <div className="glass-card rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">{selectedSend.subject}</h3>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">{formatDate(selectedSend.sent_at)} · {selectedSend.recipient_count} Empfänger</div>
              </div>
              {(() => {
                const failedRecipients = sendRecipients.filter((r) => r.status === 'sent')
                return !loadingDetail && failedRecipients.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    {retryConfirm && !retrying && (
                      <button onClick={() => setRetryConfirm(false)} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">Abbrechen</button>
                    )}
                    <button onClick={() => handleRetryFailed(selectedSend)} disabled={retrying} className={`rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${retryConfirm ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                      {retrying ? 'Wird gesendet…' : retryConfirm ? `Jetzt ${failedRecipients.length} Emails senden?` : `${failedRecipients.length} fehlgeschlagene nochmal senden`}
                    </button>
                  </div>
                )
              })()}
            </div>
          </div>

          {loadingDetail ? (
            <div className="glass-card rounded-xl p-6 text-center text-[var(--text-secondary)]">Laden…</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="glass-card rounded-xl p-4 text-center">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{selectedSend.delivered_count ?? 0}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">Zugestellt</div>
                </div>
                <div className="glass-card rounded-xl p-4 text-center">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">{selectedSend.clicked_count ?? 0}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">Geklickt</div>
                </div>
                <div className="glass-card rounded-xl p-4 text-center">
                  <div className={`text-xl font-bold ${(selectedSend.bounced_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{selectedSend.bounced_count ?? 0}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">Bounced</div>
                </div>
              </div>

              {/* A/B Variants */}
              {sendVariants.length > 0 && (() => {
                const ctr = (v: VariantStats) =>
                  v.recipient_count > 0 ? v.clicked_count / v.recipient_count : 0
                const winnerLabel = sendVariants.reduce<string | null>(
                  (best, v) => {
                    if (!best) return v.label
                    const bestRow = sendVariants.find((x) => x.label === best)!
                    return ctr(v) > ctr(bestRow) ? v.label : best
                  },
                  null,
                )
                return (
                  <div className="glass-card overflow-hidden rounded-xl">
                    <div className="border-b border-[var(--border)] px-5 py-3">
                      <h4 className="font-medium text-[var(--text)]">A/B-Test · Varianten</h4>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {sendVariants.map((v) => {
                        const rate = v.recipient_count > 0
                          ? Math.round((v.clicked_count / v.recipient_count) * 100)
                          : 0
                        const isWinner = v.label === winnerLabel && (selectedSend.clicked_count ?? 0) > 0
                        return (
                          <div key={v.label} className="px-5 py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text)]">
                                    {v.label}
                                  </span>
                                  {isWinner && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      Sieger (CTR)
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-sm text-[var(--text)]" title={v.subject}>
                                  {v.subject}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold tabular-nums text-[var(--text)]">{rate}%</div>
                                <div className="text-[10px] text-[var(--text-muted)]">
                                  {v.clicked_count} / {v.recipient_count} Klicks
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                              <div
                                className={`h-full ${isWinner ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Link Performance */}
              {sendLinkClicks.length > 0 && (
                <div className="glass-card overflow-hidden rounded-xl">
                  <div className="border-b border-[var(--border)] px-5 py-3"><h4 className="font-medium text-[var(--text)]">Link-Performance</h4></div>
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-[var(--border)]"><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">URL</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Eindeutig</th></tr></thead>
                    <tbody>
                      {sendLinkClicks.map((lc, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-5 py-3 text-[var(--text)]"><span className="block max-w-xs truncate" title={lc.url}>{lc.url.length > 60 ? lc.url.substring(0, 57) + '…' : lc.url}</span></td>
                          <td className="px-5 py-3 text-right text-[var(--text)]">{lc.click_count}</td>
                          <td className="px-5 py-3 text-right text-[var(--text)]">{lc.unique_clickers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Click Heatmap */}
              {sendLinkClicks.length > 0 && (() => {
                let html: string | null = null
                if (sendBlocksJson) {
                  try {
                    const blocks = JSON.parse(sendBlocksJson) as NewsletterBlock[]
                    const postsMap: Record<string, PostRef> = {}
                    for (const p of posts) postsMap[p.slug] = p
                    html = buildMultiBlockNewsletterHtml(siteConfig, blocks, postsMap, '#')
                  } catch { /* fallback to list */ }
                }
                return html
                  ? <ClickHeatmap html={html} linkClicks={sendLinkClicks} recipientCount={selectedSend.recipient_count} />
                  : <ClickHeatmapList linkClicks={sendLinkClicks} recipientCount={selectedSend.recipient_count} />
              })()}

              {/* Recipients Table */}
              {sendRecipients.length > 0 && (
                <div className="glass-card overflow-hidden rounded-xl">
                  <div className="border-b border-[var(--border)] px-5 py-3"><h4 className="font-medium text-[var(--text)]">Empfänger ({sendRecipients.length})</h4></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b border-[var(--border)]"><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">E-Mail</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Status</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounce</th></tr></thead>
                      <tbody>
                        {sendRecipients.map((r) => {
                          const badge = RECIPIENT_BADGE[r.status] ?? RECIPIENT_BADGE.sent
                          const bounceLabel = r.bounce_type
                            ? `${r.bounce_type}${r.bounce_sub_type ? ` · ${r.bounce_sub_type}` : ''}`
                            : null
                          return (
                            <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                              <td className="px-5 py-3 text-[var(--text)]">
                                <span className="inline-flex items-center gap-2">
                                  <EngagementDot tier={r.engagement_tier} score={r.engagement_score} />
                                  {r.email}
                                </span>
                              </td>
                              <td className="px-5 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span></td>
                              <td className="px-5 py-3 text-[var(--text-secondary)]">{r.delivered_at ? formatDate(r.delivered_at) : '—'}</td>
                              <td className="px-5 py-3 text-right text-[var(--text)]">{r.click_count > 0 ? r.click_count : '—'}</td>
                              <td className="px-5 py-3 text-[var(--text-secondary)]">
                                {bounceLabel ? (
                                  <span title={r.bounce_message ?? undefined}>{bounceLabel}</span>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
        {/* Geplante Sends */}
        {scheduledSends.length > 0 && (
          <div className="glass-card overflow-hidden rounded-xl">
            <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 px-5 py-3 flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h4 className="font-medium text-[var(--text)]">Geplant ({scheduledSends.length})</h4>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {scheduledSends.map((s) => {
                const when = s.scheduled_for
                  ? new Date(s.scheduled_for).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'
                const isConfirming = cancelConfirmId === s.id
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text)]">{s.subject}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {when} · {s.recipient_count} Empfänger
                      </div>
                    </div>
                    {isConfirming ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCancelConfirmId(null)}
                          disabled={cancelling}
                          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                        >
                          Doch nicht
                        </button>
                        <button
                          onClick={() => handleCancelScheduled(s)}
                          disabled={cancelling}
                          className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          {cancelling ? 'Wird abgebrochen…' : 'Versand abbrechen'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCancelConfirmId(s.id)}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400"
                      >
                        Abbrechen
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Send List */}
        <div className="glass-card overflow-hidden rounded-xl">
          {visibleSends.length === 0 ? (
            <div className="px-6 py-12 text-center text-[var(--text-secondary)]">Noch keine Newsletter versendet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-[var(--border)]"><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Betreff</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Empfänger</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geklickt</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounced</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Datum</th></tr></thead>
                <tbody>
                  {visibleSends.map((s) => {
                    const hasTracking = (s.delivered_count ?? 0) > 0 || (s.bounced_count ?? 0) > 0
                    const clickRate = hasTracking && s.recipient_count > 0 ? Math.round(((s.clicked_count ?? 0) / s.recipient_count) * 100) : null
                    const isCancelled = s.status === 'cancelled'
                    return (
                      <tr key={s.id} onClick={() => loadSendDetail(s)} className={`cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-secondary)] ${isCancelled ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3 text-[var(--text)]">
                          <div className="font-medium">{s.subject}</div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {s.post_title}
                            {isCancelled && <span className="ml-2 inline-block rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--text-muted)]">Abgebrochen</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[var(--text)]">{s.recipient_count}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? (s.delivered_count ?? 0) : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? <span>{s.clicked_count ?? 0}{clickRate !== null ? ` (${clickRate}%)` : ''}</span> : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? (s.bounced_count ?? 0) : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(s.scheduled_for ?? s.sent_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
