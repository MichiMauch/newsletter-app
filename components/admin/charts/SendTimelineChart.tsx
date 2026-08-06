'use client'

import { useState } from 'react'
import { buildSendTimeline, formatOffset } from '@/lib/send-timeline'
import { parseDbDate } from '@/lib/parse-db-date'

interface Props {
  /** delivered_at aller Empfänger, die die Mail bekommen haben. */
  deliveries: string[]
  /** Zeitpunkte aller Engagement-Klicks. */
  clicks: string[]
}

const W = 620
const PL = 34
const PR = 12
const PT = 10
/** Höhe je Spur; zwei Spuren übereinander teilen sich die Zeitachse. */
const LANE_H = 58
const LANE_GAP = 20
const AXIS_H = 26

/**
 * Zustellungen und Klicks auf einer gemeinsamen Zeitachse.
 *
 * Zwei getrennte Spuren mit EIGENER Skala statt gestapelter Balken: bei 62
 * Zustellungen und 8 Klicks würde eine gemeinsame Skala die Klicks zu einer
 * unlesbaren Linie am Boden drücken. Die Achsenbeschriftung links nennt
 * deshalb je Spur ihr eigenes Maximum — sonst liesse sich die Höhe der Balken
 * zwischen den Spuren fälschlich vergleichen.
 */
export default function SendTimelineChart({ deliveries, clicks }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const timeline = buildSendTimeline(deliveries, clicks)
  if (!timeline || timeline.buckets.length === 0) return null

  const { buckets, bucketMinutes, maxDeliveries, maxClicks } = timeline
  const H = PT + LANE_H + LANE_GAP + LANE_H + AXIS_H
  const cw = W - PL - PR
  const barW = Math.max(cw / buckets.length - 2, 1)

  const laneTop = (lane: 0 | 1) => PT + lane * (LANE_H + LANE_GAP)
  const toX = (i: number) => PL + (i / buckets.length) * cw
  const barH = (value: number, max: number) => (max > 0 ? (value / max) * LANE_H : 0)

  // Nur wenige Beschriftungen, sonst überlappen sie bei 24 Fenstern.
  const labelEvery = Math.ceil(buckets.length / 6)
  const hovered = hoverIdx !== null ? buckets[hoverIdx] : null

  const bucketLabel = (iso: string) =>
    parseDbDate(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

  const windowLabel = bucketMinutes < 60
    ? `${bucketMinutes}-Minuten-Fenster`
    : `${bucketMinutes / 60}-Stunden-Fenster`

  return (
    <div className="glass-card rounded-xl p-6 shadow-lg">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          Versand und Klicks im Zeitverlauf
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">{windowLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img"
          aria-label="Zustellungen und Klicks im Zeitverlauf">
          {([0, 1] as const).map((lane) => {
            const isDeliveries = lane === 0
            const max = isDeliveries ? maxDeliveries : maxClicks
            const top = laneTop(lane)
            return (
              <g key={lane}>
                <line x1={PL} y1={top + LANE_H} x2={W - PR} y2={top + LANE_H}
                  stroke="var(--border)" strokeWidth="1" />
                <text x={PL - 6} y={top + 8} textAnchor="end"
                  className="fill-[var(--text-muted)]" fontSize="9">{max}</text>
                <text x={PL - 6} y={top + LANE_H} textAnchor="end"
                  className="fill-[var(--text-muted)]" fontSize="9">0</text>
                {buckets.map((b, i) => {
                  const value = isDeliveries ? b.deliveries : b.clicks
                  const h = barH(value, max)
                  if (h <= 0) return null
                  return (
                    <rect key={i} x={toX(i)} y={top + LANE_H - h} width={barW} height={h}
                      rx="1"
                      className={isDeliveries ? 'fill-blue-400/70' : 'fill-emerald-500'} />
                  )
                })}
                <text x={PL} y={top - 1} className="fill-[var(--text-secondary)]" fontSize="10">
                  {isDeliveries ? 'Zustellungen' : 'Klicks'}
                </text>
              </g>
            )
          })}

          {/* Unsichtbare Trefferflächen über beide Spuren — ein Hover zeigt
              Zustellungen und Klicks desselben Fensters gemeinsam. */}
          {buckets.map((b, i) => (
            <rect key={`hit-${i}`} x={toX(i)} y={PT} width={Math.max(cw / buckets.length, 1)}
              height={H - PT - AXIS_H} fill="transparent"
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <title>{`${bucketLabel(b.start)} · ${b.deliveries} zugestellt · ${b.clicks} Klicks`}</title>
            </rect>
          ))}

          {buckets.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={`lbl-${i}`} x={toX(i) + barW / 2} y={H - 8} textAnchor="middle"
                className="fill-[var(--text-muted)]" fontSize="9">
                {bucketLabel(b.start)}
              </text>
            ) : null,
          )}

          {hovered && (
            <line x1={toX(hoverIdx!) + barW / 2} y1={PT} x2={toX(hoverIdx!) + barW / 2}
              y2={H - AXIS_H} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 2" />
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        {hovered ? (
          <span>
            <strong className="text-[var(--text)]">{bucketLabel(hovered.start)}</strong>
            {' · '}{hovered.deliveries} zugestellt · {hovered.clicks} Klicks
          </span>
        ) : (
          <>
            {timeline.firstClickAfterMin !== null && (
              <span>Erster Klick <strong className="text-[var(--text)]">{formatOffset(timeline.firstClickAfterMin)}</strong></span>
            )}
            {timeline.medianClickAfterMin !== null && (
              <span>Median <strong className="text-[var(--text)]">{formatOffset(timeline.medianClickAfterMin)}</strong></span>
            )}
            {timeline.lastClickAfterMin !== null && (
              <span>Letzter <strong className="text-[var(--text)]">{formatOffset(timeline.lastClickAfterMin)}</strong></span>
            )}
            <span className="text-[var(--text-muted)]">jeweils nach der ersten Zustellung</span>
          </>
        )}
      </div>
    </div>
  )
}
