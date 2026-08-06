/**
 * Zeitachse eines Versands: wann gingen die Mails raus, wann kamen die Klicks.
 *
 * Beides gehört zusammen in ein Bild, weil die Zustellung nicht auf einen Schlag
 * passiert — der Versand vom 06.08. lief über 74 Minuten, und mit der
 * Sendezeit-Optimierung wird die Staffelung eher grösser. Eine Klick-Uhrzeit
 * ohne die zugehörige Zustellkurve daneben lässt sich schlicht nicht einordnen.
 */

import { parseDbDate } from './parse-db-date'

export interface TimelineBucket {
  /** Beginn des Zeitfensters (ISO). */
  start: string
  deliveries: number
  clicks: number
}

export interface SendTimeline {
  buckets: TimelineBucket[]
  bucketMinutes: number
  maxDeliveries: number
  maxClicks: number
  /** Zeit vom ersten Versand bis zum ersten bzw. letzten Klick, in Minuten. */
  firstClickAfterMin: number | null
  medianClickAfterMin: number | null
  lastClickAfterMin: number | null
}

/**
 * Fenstergrössen in Minuten. Gewählt wird die kleinste, mit der die Zeitspanne
 * in höchstens MAX_BUCKETS Balken passt — so bleibt das Diagramm lesbar,
 * egal ob ein Versand in zehn Minuten durch ist oder drei Tage nachwirkt.
 */
const BUCKET_SIZES_MIN = [5, 15, 30, 60, 120, 240, 360, 720, 1440]
const MAX_BUCKETS = 24

export function pickBucketMinutes(spanMinutes: number): number {
  for (const size of BUCKET_SIZES_MIN) {
    if (spanMinutes / size <= MAX_BUCKETS) return size
  }
  return BUCKET_SIZES_MIN[BUCKET_SIZES_MIN.length - 1]
}

function toMs(value: string): number {
  return parseDbDate(value).getTime()
}

/**
 * @param deliveries Zustellzeitpunkte (delivered_at der Empfänger)
 * @param clicks     Zeitpunkte aller Engagement-Klicks — Scanner und
 *                   Abmeldungen sind bereits aussortiert, siehe
 *                   getClickTimestampsForSend
 */
export function buildSendTimeline(deliveries: string[], clicks: string[]): SendTimeline | null {
  const deliveryMs = deliveries.map(toMs).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  const clickMs = clicks.map(toMs).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  if (deliveryMs.length === 0 && clickMs.length === 0) return null

  const all = [...deliveryMs, ...clickMs]
  const start = Math.min(...all)
  const end = Math.max(...all)
  const spanMinutes = (end - start) / 60_000

  const bucketMinutes = pickBucketMinutes(spanMinutes)
  const bucketMs = bucketMinutes * 60_000

  // Auf das Fensterraster abrunden, damit die Achsenbeschriftung auf runden
  // Zeiten sitzt statt auf der zufälligen Sekunde der ersten Zustellung.
  const gridStart = Math.floor(start / bucketMs) * bucketMs
  const bucketCount = Math.floor((end - gridStart) / bucketMs) + 1

  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: new Date(gridStart + i * bucketMs).toISOString(),
    deliveries: 0,
    clicks: 0,
  }))

  for (const ms of deliveryMs) {
    buckets[Math.floor((ms - gridStart) / bucketMs)].deliveries++
  }
  for (const ms of clickMs) {
    buckets[Math.floor((ms - gridStart) / bucketMs)].clicks++
  }

  // Abstände beziehen sich auf den ersten Versand, nicht auf das Raster.
  const afterMin = (ms: number) => Math.round((ms - start) / 60_000)
  const median = clickMs.length > 0 ? clickMs[Math.floor((clickMs.length - 1) / 2)] : null

  return {
    buckets,
    bucketMinutes,
    maxDeliveries: Math.max(...buckets.map((b) => b.deliveries), 0),
    maxClicks: Math.max(...buckets.map((b) => b.clicks), 0),
    firstClickAfterMin: clickMs.length > 0 ? afterMin(clickMs[0]) : null,
    medianClickAfterMin: median !== null ? afterMin(median) : null,
    lastClickAfterMin: clickMs.length > 0 ? afterMin(clickMs[clickMs.length - 1]) : null,
  }
}

/** "+2h 43min", "+18min", "sofort" — kompakt genug für eine Tabellenzelle. */
export function formatOffset(minutes: number): string {
  if (minutes < 1) return 'sofort'
  if (minutes < 60) return `+${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 48) return m === 0 ? `+${h}h` : `+${h}h ${String(m).padStart(2, '0')}min`
  return `+${Math.round(h / 24)}d`
}
