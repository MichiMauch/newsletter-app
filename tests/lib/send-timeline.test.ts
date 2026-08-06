import { describe, it, expect } from 'vitest'
import { buildSendTimeline, pickBucketMinutes, formatOffset } from '@/lib/send-timeline'

const BASE = '2026-08-06T06:33:00.000Z'

/** Zeitstempel `minutes` Minuten nach BASE. */
function t(minutes: number): string {
  return new Date(new Date(BASE).getTime() + minutes * 60_000).toISOString()
}

describe('pickBucketMinutes', () => {
  it('wählt feine Fenster für kurze Versände', () => {
    expect(pickBucketMinutes(30)).toBe(5)
    expect(pickBucketMinutes(90)).toBe(5)
  })

  it('vergröbert, wenn sonst zu viele Balken entstünden', () => {
    // 8 Stunden in 5-Minuten-Fenstern wären 96 Balken.
    expect(pickBucketMinutes(8 * 60)).toBe(30)
    expect(pickBucketMinutes(3 * 24 * 60)).toBe(240)
  })

  it('bleibt auch bei extremen Zeitspannen begrenzt', () => {
    expect(pickBucketMinutes(365 * 24 * 60)).toBe(1440)
  })
})

describe('buildSendTimeline', () => {
  it('meldet null ohne jede Datenlage', () => {
    expect(buildSendTimeline([], [])).toBe(null)
  })

  it('verteilt Zustellungen und Klicks auf dieselbe Achse', () => {
    const timeline = buildSendTimeline([t(0), t(1), t(2)], [t(20), t(21)])!

    const totalDeliveries = timeline.buckets.reduce((s, b) => s + b.deliveries, 0)
    const totalClicks = timeline.buckets.reduce((s, b) => s + b.clicks, 0)
    expect(totalDeliveries).toBe(3)
    expect(totalClicks).toBe(2)
  })

  it('rechnet die Abstände ab der ERSTEN Zustellung', () => {
    // Der Versand ist gestaffelt — Bezugspunkt ist der Beginn, nicht das Raster.
    const timeline = buildSendTimeline([t(0), t(74)], [t(2), t(60), t(240)])!

    expect(timeline.firstClickAfterMin).toBe(2)
    expect(timeline.medianClickAfterMin).toBe(60)
    expect(timeline.lastClickAfterMin).toBe(240)
  })

  it('lässt die Maxima je Spur getrennt', () => {
    // 62 Zustellungen gegen 2 Klicks: eine gemeinsame Skala würde die Klicks
    // unsichtbar machen, deshalb liefert die Timeline beide Maxima einzeln.
    const deliveries = Array.from({ length: 62 }, (_, i) => t(i % 3))
    const timeline = buildSendTimeline(deliveries, [t(120), t(121)])!

    expect(timeline.maxDeliveries).toBeGreaterThan(timeline.maxClicks)
    expect(timeline.maxClicks).toBe(2)
  })

  it('kommt mit einem Versand ohne einen einzigen Klick klar', () => {
    const timeline = buildSendTimeline([t(0), t(5)], [])!

    expect(timeline.firstClickAfterMin).toBe(null)
    expect(timeline.medianClickAfterMin).toBe(null)
    expect(timeline.maxClicks).toBe(0)
    expect(timeline.buckets.length).toBeGreaterThan(0)
  })

  it('ignoriert unbrauchbare Zeitstempel, statt das Diagramm zu sprengen', () => {
    const timeline = buildSendTimeline([t(0), 'kaputt', ''], [t(10)])!

    const totalDeliveries = timeline.buckets.reduce((s, b) => s + b.deliveries, 0)
    expect(totalDeliveries).toBe(1)
  })

  it('setzt die Fenster auf ein rundes Raster', () => {
    // Beginnt der Versand um 06:33, soll der erste Balken auf 06:30 sitzen,
    // nicht auf der zufälligen Startsekunde.
    const timeline = buildSendTimeline([t(0)], [t(3)])!
    const first = new Date(timeline.buckets[0].start)
    expect(first.getUTCMinutes() % timeline.bucketMinutes).toBe(0)
    expect(first.getUTCSeconds()).toBe(0)
  })

  it('deckt mit den Fenstern die ganze Spanne ab', () => {
    const timeline = buildSendTimeline([t(0)], [t(200)])!
    const last = new Date(timeline.buckets[timeline.buckets.length - 1].start).getTime()
    const lastClick = new Date(t(200)).getTime()
    expect(last).toBeLessThanOrEqual(lastClick)
    expect(last + timeline.bucketMinutes * 60_000).toBeGreaterThan(lastClick)
  })
})

describe('formatOffset', () => {
  it('formatiert kurze Abstände', () => {
    expect(formatOffset(0)).toBe('sofort')
    expect(formatOffset(18)).toBe('+18min')
  })

  it('formatiert Stunden mit Minuten', () => {
    expect(formatOffset(163)).toBe('+2h 43min')
    expect(formatOffset(120)).toBe('+2h')
  })

  it('fasst sehr lange Abstände zu Tagen zusammen', () => {
    expect(formatOffset(72 * 60)).toBe('+3d')
  })
})
