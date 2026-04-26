'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { LinkClickRow } from '../types'

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-5" style={{ background: 'hsla(60,100%,50%,0.4)', border: '1px solid hsla(60,100%,45%,0.6)' }} /> Wenig
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-5" style={{ background: 'hsla(30,100%,50%,0.4)', border: '1px solid hsla(30,100%,45%,0.6)' }} /> Mittel
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-5" style={{ background: 'hsla(0,100%,50%,0.5)', border: '1px solid hsla(0,100%,45%,0.8)' }} /> Viel
      </span>
    </div>
  )
}

interface ClickHeatmapProps {
  html: string
  linkClicks: LinkClickRow[]
  recipientCount: number
}

export function ClickHeatmap({ html, linkClicks, recipientCount }: ClickHeatmapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(600)
  const maxClicks = useMemo(
    () => Math.max(...linkClicks.map((lc) => lc.click_count), 1),
    [linkClicks],
  )
  const clickMap = useMemo(() => {
    const map = new Map<string, LinkClickRow>()
    for (const lc of linkClicks) map.set(lc.url, lc)
    return map
  }, [linkClicks])

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
      if (parent) {
        const pos = doc.defaultView?.getComputedStyle(parent).position
        if (pos === 'static') parent.style.position = 'relative'
      }
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

  const handleLoad = useCallback(() => {
    setTimeout(injectHeatmap, 100)
  }, [injectHeatmap])

  const iframeSrc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:16px;background:#f3f4f6;display:flex;justify-content:center;}a{pointer-events:none;}</style></head><body>${html}</body></html>`

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <h4 className="font-medium text-[var(--text)]">Klick-Heatmap</h4>
        <HeatmapLegend />
      </div>
      <div className="relative bg-[#f3f4f6] dark:bg-[#1a1a1a]">
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrc}
          onLoad={handleLoad}
          style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }}
          sandbox="allow-same-origin"
          title="Newsletter Klick-Heatmap"
        />
      </div>
    </div>
  )
}

interface ClickHeatmapListProps {
  linkClicks: LinkClickRow[]
  recipientCount: number
}

export function ClickHeatmapList({ linkClicks, recipientCount }: ClickHeatmapListProps) {
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
          try {
            const u = new URL(lc.url)
            label = u.pathname === '/' ? u.hostname : u.pathname.replace(/\/$/, '').split('/').pop() || u.pathname
          } catch { /* keep full url */ }
          return (
            <div key={i} className="relative">
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${barWidth}%`,
                  background: `hsla(${hue}, 100%, 50%, ${0.1 + intensity * 0.15})`,
                  borderRight: `3px solid hsla(${hue}, 100%, 45%, ${0.5 + intensity * 0.4})`,
                }}
              />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] truncate" title={lc.url}>{label}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate" title={lc.url}>
                    {lc.url.length > 70 ? lc.url.substring(0, 67) + '…' : lc.url}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-white px-2 py-0.5" style={{ background: `hsl(${hue}, 90%, 42%)` }}>
                    {lc.click_count} Klicks
                  </span>
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
