'use client'

import { useState } from 'react'
import type { SubscriberGrowth } from '../types'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mär', '04': 'Apr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Dez',
}

type GrowthRange = '6m' | '12m' | 'all'

export default function SubscriberGrowthChart({ data }: { data: SubscriberGrowth[] }) {
  const [range, setRange] = useState<GrowthRange>('12m')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) return null

  const filtered = range === 'all' ? data : data.slice(-(range === '6m' ? 6 : 12))
  const totals = filtered.map((d) => d.total)
  const dataMax = Math.max(...totals)
  const dataMin = Math.min(...totals)
  const padding = Math.max(Math.ceil((dataMax - dataMin) * 0.2), 2)
  const yMin = Math.max(dataMin - padding, 0)
  const yMax = dataMax + padding
  const yRange = yMax - yMin || 1

  const netChange = filtered[filtered.length - 1].total - filtered[0].total
  const totalNew = filtered.reduce((sum, d) => sum + d.new_count, 0)
  const totalUnsub = totalNew - netChange
  const current = filtered[filtered.length - 1].total

  const W = 600, H = 200, PL = 40, PR = 16, PT = 12, PB = 28
  const cw = W - PL - PR, ch = H - PT - PB

  const toX = (i: number) => PL + (i / (filtered.length - 1)) * cw
  const toY = (v: number) => PT + ch - ((v - yMin) / yRange) * ch

  const linePath = filtered.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.total).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(filtered.length - 1).toFixed(1)},${toY(yMin).toFixed(1)} L${toX(0).toFixed(1)},${toY(yMin).toFixed(1)} Z`

  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]
  const step = steps.find((s) => yRange / s <= 5) || 2500
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    if (v > yMin) gridLines.push(v)
  }

  const rangeButtons: { key: GrowthRange; label: string }[] = [
    { key: '6m', label: '6M' }, { key: '12m', label: '1J' }, { key: 'all', label: 'Alle' },
  ]

  const hoverData = hoverIdx !== null ? filtered[hoverIdx] : null
  const hoverLabel = hoverData ? (() => {
    const [y, m] = hoverData.month.split('-')
    return `${MONTH_LABELS[m] || m} ${y}`
  })() : ''

  return (
    <div className="glass-card rounded-xl p-6 shadow-lg">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Abonnenten</h3>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-[var(--text)]">{current}</span>
            <span className={`text-sm font-semibold ${netChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {netChange >= 0 ? '+' : ''}{netChange}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
            <div className="text-center">
              <div className="text-lg font-semibold text-primary-600 dark:text-primary-400">+{totalNew}</div>
              <div>Neu</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-500">-{totalUnsub}</div>
              <div>Abgemeldet</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-[var(--text)]">{(totalNew / filtered.length).toFixed(1)}</div>
              <div>Ø Neu/Mt.</div>
            </div>
          </div>
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            {rangeButtons.map(({ key, label }) => (
              <button key={key} onClick={() => setRange(key)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === key ? 'bg-primary-500 text-white rounded-lg shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', maxHeight: 240 }} onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {gridLines.map((v) => (
            <g key={v}>
              <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="var(--color-text-secondary, #888)" strokeWidth="0.5" opacity="0.15" strokeDasharray="4 3" />
              <text x={PL - 6} y={toY(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6">{v}</text>
            </g>
          ))}
          {filtered.map((d, i) => {
            const [y, m] = d.month.split('-')
            const showLabel = filtered.length <= 12 || i % Math.ceil(filtered.length / 12) === 0 || i === filtered.length - 1
            if (!showLabel) return null
            return <text key={d.month} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6">{MONTH_LABELS[m] || m} {y.slice(2)}</text>
          })}
          <path d={areaPath} fill="url(#areaGrad)" />
          <path d={linePath} fill="none" stroke="var(--color-primary-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {filtered.map((d, i) => (
            <circle key={d.month} cx={toX(i)} cy={toY(d.total)} r={hoverIdx === i ? 5 : 3} fill={hoverIdx === i ? 'var(--color-primary-600)' : 'var(--color-primary-500)'} stroke="var(--color-bg, #fff)" strokeWidth="2" className="transition-all duration-150" />
          ))}
          {filtered.map((_, i) => {
            const x0 = i === 0 ? PL : (toX(i - 1) + toX(i)) / 2
            const x1 = i === filtered.length - 1 ? W - PR : (toX(i) + toX(i + 1)) / 2
            return <rect key={i} x={x0} y={PT} width={x1 - x0} height={ch} fill="transparent" onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'crosshair' }} />
          })}
          {hoverIdx !== null && <line x1={toX(hoverIdx)} y1={PT} x2={toX(hoverIdx)} y2={PT + ch} stroke="var(--color-primary-500)" strokeWidth="1" opacity="0.3" strokeDasharray="3 2" />}
        </svg>
        {hoverData && hoverIdx !== null && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 shadow-lg" style={{ left: `${(toX(hoverIdx) / W) * 100}%`, top: 0, transform: `translateX(${hoverIdx > filtered.length / 2 ? '-100%' : '0'})` }}>
            <div className="text-xs font-medium text-[var(--text)]">{hoverLabel}</div>
            <div className="mt-1 text-sm font-bold text-[var(--text)]">{hoverData.total} Abonnenten</div>
            {hoverData.new_count > 0 && <div className="text-xs text-primary-600 dark:text-primary-400">+{hoverData.new_count} neu</div>}
            {hoverIdx > 0 && (
              <div className={`text-xs ${hoverData.total >= filtered[hoverIdx - 1].total ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {hoverData.total >= filtered[hoverIdx - 1].total ? '+' : ''}{hoverData.total - filtered[hoverIdx - 1].total} netto
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
