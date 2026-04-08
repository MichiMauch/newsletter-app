'use client'

import { useState, useRef, useCallback } from 'react'
import EngagementTrendChart from './charts/EngagementTrendChart'
import SubscriberGrowthChart from './charts/SubscriberGrowthChart'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import type { SiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import type {
  NewsletterSend, Post, SendTrend, SubscriberGrowth,
  OverallStatsData, NewsletterRecipientRow, LinkClickRow, ToastState,
} from './types'
import { formatDate } from './types'

interface HistoryTabProps {
  sends: NewsletterSend[]
  posts: Post[]
  sendTrends: SendTrend[]
  subscriberGrowth: SubscriberGrowth[]
  overallStats: OverallStatsData | null
  siteConfig: SiteConfig
  setToast: (toast: ToastState) => void
  loadData: () => void
  streamingSend: (body: object, onProgress: (data: { sent: number; total: number; remaining: number }) => void) => Promise<{ sent: number; total: number }>
}

export default function HistoryTab({
  sends, posts, sendTrends, subscriberGrowth, overallStats,
  siteConfig, setToast, loadData, streamingSend,
}: HistoryTabProps) {
  const [selectedSend, setSelectedSend] = useState<NewsletterSend | null>(null)
  const [sendRecipients, setSendRecipients] = useState<NewsletterRecipientRow[]>([])
  const [sendLinkClicks, setSendLinkClicks] = useState<LinkClickRow[]>([])
  const [sendBlocksJson, setSendBlocksJson] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryConfirm, setRetryConfirm] = useState(false)

  async function loadSendDetail(send: NewsletterSend) {
    setSelectedSend(send)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/newsletter?sendDetail=${send.id}`)
      const json = await res.json()
      setSendRecipients(json.sendDetail?.recipients ?? [])
      setSendLinkClicks(json.sendDetail?.linkClicks ?? [])
      setSendBlocksJson(json.sendDetail?.blocksJson ?? null)
    } catch (err) {
      console.error('Failed to load send detail:', err)
    }
    setLoadingDetail(false)
  }

  async function handleRetryFailed(send: NewsletterSend) {
    const failedCount = sendRecipients.filter((r) => r.status === 'sent').length
    if (failedCount === 0) {
      setToast({ type: 'info', message: 'Keine fehlgeschlagenen Empfänger.' })
      return
    }
    if (!retryConfirm) { setRetryConfirm(true); return }
    setRetryConfirm(false)
    setRetrying(true)
    try {
      const result = await streamingSend(
        { action: 'retry-failed', sendId: send.id },
        ({ sent, total }) => setToast({ type: 'info', message: `${sent} von ${total} nachgesendet…` })
      )
      if (result.sent > 0) setToast({ type: 'success', message: `${result.sent} erfolgreich nachgesendet.` })
      await loadSendDetail(send)
      await loadData()
    } catch (err: unknown) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
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
          <button onClick={() => { setSelectedSend(null); setSendRecipients([]); setSendLinkClicks([]); setSendBlocksJson(null) }} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors">
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
                          const recipientBadge: Record<string, { label: string; cls: string }> = {
                            sent: { label: 'Gesendet', cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]' },
                            delivered: { label: 'Zugestellt', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
                            clicked: { label: 'Geklickt', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
                            bounced: { label: 'Bounced', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
                            complained: { label: 'Beschwerde', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
                          }
                          const badge = recipientBadge[r.status] || recipientBadge.sent
                          return (
                            <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                              <td className="px-5 py-3 text-[var(--text)]">{r.email}</td>
                              <td className="px-5 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span></td>
                              <td className="px-5 py-3 text-[var(--text-secondary)]">{r.delivered_at ? formatDate(r.delivered_at) : '—'}</td>
                              <td className="px-5 py-3 text-right text-[var(--text)]">{r.click_count > 0 ? r.click_count : '—'}</td>
                              <td className="px-5 py-3 text-[var(--text-secondary)]">{r.bounce_type || '—'}</td>
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
        /* Send List */
        <div className="glass-card overflow-hidden rounded-xl">
          {sends.length === 0 ? (
            <div className="px-6 py-12 text-center text-[var(--text-secondary)]">Noch keine Newsletter versendet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-[var(--border)]"><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Betreff</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Empfänger</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geklickt</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounced</th><th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Datum</th></tr></thead>
                <tbody>
                  {sends.map((s) => {
                    const hasTracking = (s.delivered_count ?? 0) > 0 || (s.bounced_count ?? 0) > 0
                    const clickRate = hasTracking && s.recipient_count > 0 ? Math.round(((s.clicked_count ?? 0) / s.recipient_count) * 100) : null
                    return (
                      <tr key={s.id} onClick={() => loadSendDetail(s)} className="cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-secondary)]">
                        <td className="px-5 py-3 text-[var(--text)]"><div className="font-medium">{s.subject}</div><div className="text-xs text-[var(--text-secondary)]">{s.post_title}</div></td>
                        <td className="px-5 py-3 text-[var(--text)]">{s.recipient_count}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? (s.delivered_count ?? 0) : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? <span>{s.clicked_count ?? 0}{clickRate !== null ? ` (${clickRate}%)` : ''}</span> : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text)]">{hasTracking ? (s.bounced_count ?? 0) : '—'}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(s.sent_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Click Heatmap (iframe-based) ─────────────────────────────────────

function ClickHeatmap({ html, linkClicks, recipientCount }: { html: string; linkClicks: LinkClickRow[]; recipientCount: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(600)
  const maxClicks = Math.max(...linkClicks.map((lc) => lc.click_count), 1)
  const clickMap = new Map<string, LinkClickRow>()
  for (const lc of linkClicks) clickMap.set(lc.url, lc)

  const injectHeatmap = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    if (doc.body) setIframeHeight(doc.body.scrollHeight + 20)
    doc.querySelectorAll('a[href]').forEach((link) => {
      const a = link as HTMLAnchorElement
      const lc = clickMap.get(a.href)
      if (!lc) return
      const parent = a.parentElement
      if (parent) { const pos = doc.defaultView?.getComputedStyle(parent).position; if (pos === 'static') parent.style.position = 'relative' }
      const intensity = lc.click_count / maxClicks
      const clickPct = recipientCount > 0 ? Math.round((lc.unique_clickers / recipientCount) * 100) : 0
      const hue = Math.round((1 - intensity) * 60)
      a.style.position = 'relative'
      a.style.backgroundColor = `hsla(${hue}, 100%, 50%, ${0.15 + intensity * 0.35})`
      a.style.outline = `2px solid hsla(${hue}, 100%, 45%, ${0.4 + intensity * 0.4})`
      a.style.outlineOffset = '2px'
      const badge = doc.createElement('span')
      badge.textContent = `${lc.click_count} Klicks · ${clickPct}%`
      badge.style.cssText = `position:absolute;top:-10px;right:-4px;z-index:10;background:hsl(${hue},90%,42%);color:#fff;font-size:10px;font-weight:700;font-family:system-ui,sans-serif;padding:2px 7px;border-radius:6px;white-space:nowrap;line-height:1.4;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.2);`
      a.appendChild(badge)
    })
  }, [clickMap, maxClicks, recipientCount])

  const handleLoad = useCallback(() => { setTimeout(injectHeatmap, 100) }, [injectHeatmap])

  const iframeSrc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:16px;background:#f3f4f6;display:flex;justify-content:center;}a{pointer-events:none;}</style></head><body>${html}</body></html>`

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <h4 className="font-medium text-[var(--text)]">Klick-Heatmap</h4>
        <HeatmapLegend />
      </div>
      <div className="relative bg-[#f3f4f6] dark:bg-[#1a1a1a]">
        <iframe ref={iframeRef} srcDoc={iframeSrc} onLoad={handleLoad} style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }} sandbox="allow-same-origin" title="Newsletter Klick-Heatmap" />
      </div>
    </div>
  )
}

// ─── Click Heatmap List (fallback) ────────────────────────────────────

function ClickHeatmapList({ linkClicks, recipientCount }: { linkClicks: LinkClickRow[]; recipientCount: number }) {
  const maxClicks = Math.max(...linkClicks.map((lc) => lc.click_count), 1)
  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <h4 className="font-medium text-[var(--text)]">Klick-Heatmap</h4>
        <HeatmapLegend />
      </div>
      <div className="p-5 space-y-3">
        {linkClicks.map((lc, i) => {
          const intensity = lc.click_count / maxClicks
          const hue = Math.round((1 - intensity) * 60)
          const pct = recipientCount > 0 ? Math.round((lc.unique_clickers / recipientCount) * 100) : 0
          const barWidth = Math.max(Math.round(intensity * 100), 4)
          let label = lc.url
          try { const u = new URL(lc.url); label = u.pathname === '/' ? u.hostname : u.pathname.replace(/\/$/, '').split('/').pop() || u.pathname } catch { /* keep full url */ }
          return (
            <div key={i} className="relative">
              <div className="absolute inset-y-0 left-0" style={{ width: `${barWidth}%`, background: `hsla(${hue}, 100%, 50%, ${0.1 + intensity * 0.15})`, borderRight: `3px solid hsla(${hue}, 100%, 45%, ${0.5 + intensity * 0.4})` }} />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] truncate" title={lc.url}>{label}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate" title={lc.url}>{lc.url.length > 70 ? lc.url.substring(0, 67) + '…' : lc.url}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-white px-2 py-0.5" style={{ background: `hsl(${hue}, 90%, 42%)` }}>{lc.click_count} Klicks</span>
                  <span className="text-xs text-[var(--text-secondary)]">{pct}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(60,100%,50%,0.4)', border: '1px solid hsla(60,100%,45%,0.6)' }} /> Wenig</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(30,100%,50%,0.4)', border: '1px solid hsla(30,100%,45%,0.6)' }} /> Mittel</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(0,100%,50%,0.5)', border: '1px solid hsla(0,100%,45%,0.8)' }} /> Viel</span>
    </div>
  )
}
