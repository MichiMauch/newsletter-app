'use client'

import { useState } from 'react'
import type { SendTrend } from '../types'
import { parseDbDate } from '../types'

export default function EngagementTrendChart({ trends }: { trends: SendTrend[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (trends.length < 2) return null

  const values = trends.map((t) => t.click_rate)
  const dataMax = Math.max(...values, 1)
  const dataMin = Math.min(...values)
  const padding = Math.max(Math.ceil((dataMax - dataMin) * 0.25), 2)
  const yMin = Math.max(dataMin - padding, 0)
  const yMax = Math.min(dataMax + padding, 100)
  const yRange = yMax - yMin || 1

  const avgClick = trends.reduce((s, t) => s + t.click_rate, 0) / trends.length
  const avgBounce = trends.reduce((s, t) => s + t.bounce_rate, 0) / trends.length
  const latestClick = trends[trends.length - 1].click_rate

  const W = 600, H = 200, PL = 40, PR = 16, PT = 12, PB = 28
  const cw = W - PL - PR, ch = H - PT - PB

  const toX = (i: number) => PL + (i / (trends.length - 1)) * cw
  const toY = (v: number) => PT + ch - ((v - yMin) / yRange) * ch

  const linePath = trends.map((t, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(t.click_rate).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(trends.length - 1).toFixed(1)},${toY(yMin).toFixed(1)} L${toX(0).toFixed(1)},${toY(yMin).toFixed(1)} Z`

  const steps = [1, 2, 5, 10, 20, 25, 50]
  const step = steps.find((s) => yRange / s <= 5) || 50
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    if (v > yMin) gridLines.push(v)
  }

  const hoverData = hoverIdx !== null ? trends[hoverIdx] : null
  const hoverDate = hoverData ? parseDbDate(hoverData.sent_at).toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="glass-card rounded-xl p-6 shadow-lg">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Engagement</h3>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-[var(--text)]">{latestClick.toFixed(1)}%</span>
            <span className="text-sm text-[var(--text-secondary)]">letzte Klickrate</span>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
          <div className="text-center">
            <div className="text-lg font-semibold text-primary-600 dark:text-primary-400">{avgClick.toFixed(1)}%</div>
            <div>Ø Klickrate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-500">{avgBounce.toFixed(1)}%</div>
            <div>Ø Bounce</div>
          </div>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', maxHeight: 240 }} onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            <linearGradient id="engagementGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {gridLines.map((v) => (
            <g key={v}>
              <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="var(--color-text-secondary, #888)" strokeWidth="0.5" opacity="0.15" strokeDasharray="4 3" />
              <text x={PL - 6} y={toY(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6">{v}%</text>
            </g>
          ))}
          {trends.map((t, i) => {
            const showLabel = trends.length <= 12 || i % Math.ceil(trends.length / 10) === 0 || i === trends.length - 1
            if (!showLabel) return null
            const d = parseDbDate(t.sent_at)
            const label = d.toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' })
            return <text key={t.id} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6">{label}</text>
          })}
          <path d={areaPath} fill="url(#engagementGrad)" />
          <path d={linePath} fill="none" stroke="var(--color-primary-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {trends.map((t, i) => (
            <circle key={t.id} cx={toX(i)} cy={toY(t.click_rate)} r={hoverIdx === i ? 5 : 3} fill="var(--color-primary-500)" stroke="var(--color-bg, #fff)" strokeWidth="2" className="transition-all duration-150" />
          ))}
          {trends.map((_, i) => {
            const x0 = i === 0 ? PL : (toX(i - 1) + toX(i)) / 2
            const x1 = i === trends.length - 1 ? W - PR : (toX(i) + toX(i + 1)) / 2
            return <rect key={i} x={x0} y={PT} width={x1 - x0} height={ch} fill="transparent" onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'crosshair' }} />
          })}
          {hoverIdx !== null && <line x1={toX(hoverIdx)} y1={PT} x2={toX(hoverIdx)} y2={PT + ch} stroke="var(--color-primary-500)" strokeWidth="1" opacity="0.3" strokeDasharray="3 2" />}
        </svg>
        {hoverData && hoverIdx !== null && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 shadow-lg" style={{ left: `${(toX(hoverIdx) / W) * 100}%`, top: 0, transform: `translateX(${hoverIdx > trends.length / 2 ? '-100%' : '0'})` }}>
            <div className="text-xs font-medium text-[var(--text)] truncate" style={{ maxWidth: 200 }}>{hoverData.subject}</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{hoverDate} · {hoverData.recipient_count} Empfänger</div>
            <div className="mt-1 text-xs"><span className="text-primary-600 dark:text-primary-400 font-semibold">{hoverData.click_rate}% Klickrate</span></div>
            {hoverData.bounce_rate > 0 && <div className="text-xs text-red-500">{hoverData.bounce_rate}% Bounce</div>}
          </div>
        )}
      </div>
    </div>
  )
}
