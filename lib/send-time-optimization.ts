/**
 * Send-Time Optimization (STO)
 *
 * Lernt aus Open/Click-Events, wann ein Empfänger seine Mails öffnet,
 * und liefert eine optimale Sendezeit. 4-Bucket-Histogram (früh/mittag/abend/nacht)
 * ist robuster bei wenig Daten als ein 24-Stunden-Histogram.
 */

import { and, eq, sql, desc } from 'drizzle-orm'
import { getDb } from './db'
import {
  subscriberOpenSignals,
  subscriberSendTimeProfile,
  newsletterRecipients,
  newsletterSends,
} from './schema'

const DEFAULT_TZ_OFFSET_MIN = 60 // Europe/Zurich (Winter); für Sommerzeit ggf. dynamisch
const SAMPLE_LIMIT = 30
const MIN_SAMPLES_FOR_PROFILE = 3
const BOT_OPEN_THRESHOLD_SECONDS = 30 // Opens innerhalb 30s nach Delivery → vermutlich Apple Mail Privacy Pre-Fetch

const BUCKETS = [
  { name: 'morning', start: 6, end: 10, anchor: 8 },
  { name: 'midday', start: 11, end: 14, anchor: 12 },
  { name: 'evening', start: 17, end: 21, anchor: 19 },
  { name: 'night', start: 22, end: 5, anchor: 23 }, // wraps midnight
] as const

function bucketForHour(hour: number): (typeof BUCKETS)[number] {
  for (const b of BUCKETS) {
    if (b.start <= b.end) {
      if (hour >= b.start && hour <= b.end) return b
    } else {
      if (hour >= b.start || hour <= b.end) return b
    }
  }
  // 15-16 Uhr Lücke → midday
  return BUCKETS[1]
}

function localPartsFromUtc(utcIso: string, tzOffsetMinutes: number): { hour: number; weekday: number } {
  const utc = new Date(utcIso)
  const local = new Date(utc.getTime() + tzOffsetMinutes * 60_000)
  return { hour: local.getUTCHours(), weekday: local.getUTCDay() }
}

// ─── Open-Event aufzeichnen ─────────────────────────────────────────────

export async function recordOpenSignal(
  siteId: string,
  email: string,
  openedAtUtc: string,
  source: 'opened' | 'clicked' = 'opened',
  resendEmailId: string | null = null,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MIN,
): Promise<void> {
  const { hour, weekday } = localPartsFromUtc(openedAtUtc, tzOffsetMinutes)
  const db = getDb()

  // Apple Mail Privacy Protection (MPP) preloadet Tracking-Pixel sofort nach Zustellung.
  // Heuristik: Wenn opened_at < 30s nach delivered_at → Bot. Klicks gelten nie als Bot
  // (echte User-Aktion, kann nicht von MPP simuliert werden).
  let isBotOpen = 0
  if (source === 'opened' && resendEmailId) {
    const recipient = await db.select({ deliveredAt: newsletterRecipients.deliveredAt })
      .from(newsletterRecipients)
      .where(eq(newsletterRecipients.resendEmailId, resendEmailId))
      .limit(1)
    const deliveredAt = recipient[0]?.deliveredAt
    if (deliveredAt) {
      const diffMs = new Date(openedAtUtc).getTime() - new Date(deliveredAt).getTime()
      if (diffMs >= 0 && diffMs < BOT_OPEN_THRESHOLD_SECONDS * 1000) {
        isBotOpen = 1
      }
    }
  }

  await db.insert(subscriberOpenSignals).values({
    siteId,
    subscriberEmail: email,
    openedAtUtc,
    hourLocal: hour,
    weekday,
    tzOffsetMinutes,
    source,
    isBotOpen,
  })
}

// ─── Best Send Hour berechnen + UPSERT in Profile ──────────────────────

export interface SendTimeProfile {
  best_hour_local: number
  second_hour_local: number | null
  preferred_weekday: number | null
  sample_size: number
  confidence: 'low' | 'medium' | 'high'
  tz_offset_minutes: number
}

export async function computeBestSendHour(siteId: string, email: string): Promise<SendTimeProfile | null> {
  const db = getDb()

  const signals = await db.select({
    hourLocal: subscriberOpenSignals.hourLocal,
    weekday: subscriberOpenSignals.weekday,
    tzOffsetMinutes: subscriberOpenSignals.tzOffsetMinutes,
    openedAtUtc: subscriberOpenSignals.openedAtUtc,
  }).from(subscriberOpenSignals)
    .where(and(
      eq(subscriberOpenSignals.siteId, siteId),
      eq(subscriberOpenSignals.subscriberEmail, email),
      eq(subscriberOpenSignals.isBotOpen, 0),
    ))
    .orderBy(desc(subscriberOpenSignals.openedAtUtc))
    .limit(SAMPLE_LIMIT)

  if (signals.length < MIN_SAMPLES_FOR_PROFILE) return null

  // Decay: neuere Signale gewichten stärker (linear, jüngste = volle Gewichtung)
  const bucketWeights = new Map<string, number>()
  const weekdayWeights = new Map<number, number>()
  const n = signals.length
  signals.forEach((s, idx) => {
    const weight = 1 - (idx / (n * 2)) // 1.0 → ~0.5
    const bucket = bucketForHour(s.hourLocal)
    bucketWeights.set(bucket.name, (bucketWeights.get(bucket.name) ?? 0) + weight)
    weekdayWeights.set(s.weekday, (weekdayWeights.get(s.weekday) ?? 0) + weight)
  })

  const ranked = [...bucketWeights.entries()].sort((a, b) => b[1] - a[1])
  const bestBucket = BUCKETS.find((b) => b.name === ranked[0][0]) ?? BUCKETS[0]
  const secondBucket = ranked[1] ? BUCKETS.find((b) => b.name === ranked[1][0]) : null

  // Preferred weekday nur, wenn ein Tag deutlich dominiert (>40% der Gewichtung)
  const totalWeekdayWeight = [...weekdayWeights.values()].reduce((a, b) => a + b, 0)
  const sortedWeekdays = [...weekdayWeights.entries()].sort((a, b) => b[1] - a[1])
  const topWeekday = sortedWeekdays[0]
  const preferredWeekday = topWeekday && topWeekday[1] / totalWeekdayWeight > 0.4 ? topWeekday[0] : null

  const confidence: 'low' | 'medium' | 'high' =
    n < 10 ? 'low' : n < 20 ? 'medium' : 'high'

  const tzOffset = signals[0].tzOffsetMinutes ?? DEFAULT_TZ_OFFSET_MIN

  const profile: SendTimeProfile = {
    best_hour_local: bestBucket.anchor,
    second_hour_local: secondBucket?.anchor ?? null,
    preferred_weekday: preferredWeekday,
    sample_size: n,
    confidence,
    tz_offset_minutes: tzOffset,
  }

  await db.insert(subscriberSendTimeProfile).values({
    siteId,
    subscriberEmail: email,
    bestHourLocal: profile.best_hour_local,
    secondHourLocal: profile.second_hour_local,
    preferredWeekday: profile.preferred_weekday,
    sampleSize: profile.sample_size,
    confidence: profile.confidence,
    tzOffsetMinutes: profile.tz_offset_minutes,
    updatedAt: sql`datetime('now')`,
  }).onConflictDoUpdate({
    target: [subscriberSendTimeProfile.siteId, subscriberSendTimeProfile.subscriberEmail],
    set: {
      bestHourLocal: profile.best_hour_local,
      secondHourLocal: profile.second_hour_local,
      preferredWeekday: profile.preferred_weekday,
      sampleSize: profile.sample_size,
      confidence: profile.confidence,
      tzOffsetMinutes: profile.tz_offset_minutes,
      updatedAt: sql`datetime('now')`,
    },
  })

  return profile
}

// ─── Optimale Sendezeit liefern ────────────────────────────────────────

export interface OptimalSendTime {
  scheduled_at_utc: string
  source: 'profile' | 'immediate'
  confidence: 'low' | 'medium' | 'high' | 'immediate'
}

const MAX_DELAY_HOURS = 72

export async function getOptimalSendTime(
  siteId: string,
  email: string,
  fromUtc: Date = new Date(),
): Promise<OptimalSendTime> {
  const db = getDb()

  const rows = await db.select({
    bestHourLocal: subscriberSendTimeProfile.bestHourLocal,
    preferredWeekday: subscriberSendTimeProfile.preferredWeekday,
    confidence: subscriberSendTimeProfile.confidence,
    tzOffsetMinutes: subscriberSendTimeProfile.tzOffsetMinutes,
  }).from(subscriberSendTimeProfile)
    .where(and(eq(subscriberSendTimeProfile.siteId, siteId), eq(subscriberSendTimeProfile.subscriberEmail, email)))
    .limit(1)

  const profile = rows[0]

  // Kein Profil → sofort verschicken (zum Zeitpunkt des Sendeklicks)
  if (!profile) {
    return {
      scheduled_at_utc: fromUtc.toISOString(),
      source: 'immediate',
      confidence: 'immediate',
    }
  }

  const targetHour = profile.bestHourLocal
  const tzOffset = profile.tzOffsetMinutes
  const preferredWeekday = profile.preferredWeekday

  // Kandidat: heute lokale Zeit auf targetHour setzen
  const localNow = new Date(fromUtc.getTime() + tzOffset * 60_000)
  const candidate = new Date(localNow)
  candidate.setUTCHours(targetHour, 0, 0, 0)

  // Wenn schon vorbei → morgen
  if (candidate.getTime() <= localNow.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }

  // Auf preferredWeekday rollen (falls vorhanden, max 6 Tage)
  if (preferredWeekday !== null) {
    let daysAhead = 0
    while (candidate.getUTCDay() !== preferredWeekday && daysAhead < 6) {
      candidate.setUTCDate(candidate.getUTCDate() + 1)
      daysAhead++
    }
  }

  // Zurück nach UTC
  const scheduledAtUtc = new Date(candidate.getTime() - tzOffset * 60_000)

  // Clamp: max 72h in der Zukunft
  const maxFuture = new Date(fromUtc.getTime() + MAX_DELAY_HOURS * 3_600_000)
  const finalUtc = scheduledAtUtc.getTime() > maxFuture.getTime() ? maxFuture : scheduledAtUtc

  return {
    scheduled_at_utc: finalUtc.toISOString(),
    source: 'profile',
    confidence: profile.confidence,
  }
}

// ─── Bootstrap: Profile aus historischen Klick-Daten erzeugen ──────────

export async function bootstrapProfilesFromClicks(siteId: string): Promise<{ signals_added: number; profiles_built: number }> {
  const db = getDb()

  const clicks = await db
    .select({ email: newsletterRecipients.email, clickedAt: newsletterRecipients.clickedAt })
    .from(newsletterRecipients)
    .innerJoin(newsletterSends, eq(newsletterSends.id, newsletterRecipients.sendId))
    .where(and(eq(newsletterSends.siteId, siteId), sql`${newsletterRecipients.clickedAt} IS NOT NULL`))

  let signalsAdded = 0
  for (const c of clicks) {
    if (!c.clickedAt) continue
    await recordOpenSignal(siteId, c.email, c.clickedAt, 'clicked')
    signalsAdded++
  }

  const distinctEmails = [...new Set(clicks.map((c) => c.email))]
  let profilesBuilt = 0
  for (const email of distinctEmails) {
    const p = await computeBestSendHour(siteId, email)
    if (p) profilesBuilt++
  }

  return { signals_added: signalsAdded, profiles_built: profilesBuilt }
}
