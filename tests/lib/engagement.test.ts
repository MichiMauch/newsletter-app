/**
 * Engagement-Score gegen eine echte SQLite-DB.
 *
 * Der Score entscheidet, wer in Re-Engagement-Automationen läuft — eine falsche
 * Zahl wirft hier stille Leser aus der Liste. Die Tests halten deshalb fest,
 * was NICHT in den Nenner gehört (abgebrochene Versände, Bounces) und dass
 * Öffnungen den Score nicht mehr beeinflussen.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'

process.env.TURSO_DB_URL = ':memory:'
process.env.TURSO_DB_TOKEN = ''

const { getDb } = await import('@/lib/db')
const { migrate } = await import('drizzle-orm/libsql/migrator')
const { computeEngagementScore } = await import('@/lib/engagement')

const db = getDb()
const SITE = 'kokomo'
const EMAIL = 'leser@example.com'

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

async function reset() {
  await db.run(sql`DELETE FROM subscriber_engagement`)
  await db.run(sql`DELETE FROM subscriber_open_signals`)
  await db.run(sql`DELETE FROM newsletter_recipients`)
  await db.run(sql`DELETE FROM newsletter_sends`)
}

/** Legt einen Versand an und trägt den Empfänger mit dem gewünschten Ausgang ein. */
async function send(opts: {
  id: number
  sentAt: string
  sendStatus?: 'sent' | 'cancelled'
  recipientStatus?: 'sent' | 'delivered' | 'clicked' | 'bounced'
  clicks?: number
}) {
  const { id, sentAt, sendStatus = 'sent', recipientStatus = 'delivered', clicks = 0 } = opts
  await db.run(sql`
    INSERT INTO newsletter_sends (id, site_id, post_slug, post_title, subject, sent_at, recipient_count, status)
    VALUES (${id}, ${SITE}, 'slug', 'Titel', 'Betreff', ${sentAt}, 1, ${sendStatus})
  `)
  await db.run(sql`
    INSERT INTO newsletter_recipients (send_id, email, resend_email_id, status, click_count, clicked_at)
    VALUES (${id}, ${EMAIL}, ${`r-${id}`}, ${recipientStatus}, ${clicks}, ${clicks > 0 ? sentAt : null})
  `)
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' })
})

beforeEach(reset)

describe('computeEngagementScore', () => {
  it('gibt vollen Score, wenn bei jedem Versand geklickt wurde', async () => {
    await send({ id: 1, sentAt: daysAgo(5), recipientStatus: 'clicked', clicks: 1 })

    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.score).toBe(100)
    expect(result.tier).toBe('active')
    expect(result.clicks_90d).toBe(1)
  })

  it('gibt Score 0 ohne Klick', async () => {
    await send({ id: 1, sentAt: daysAgo(5) })

    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.score).toBe(0)
    expect(result.tier).toBe('cold')
    expect(result.sends_90d).toBe(1)
  })

  it('zählt abgebrochene Versände nicht in den Nenner', async () => {
    // Genau der Fall aus der Produktion: ein abgebrochener Versand direkt vor
    // dem echten halbierte jedem die Klickrate — aus 100 wurden 50 Punkte.
    await send({ id: 1, sentAt: daysAgo(6), sendStatus: 'cancelled', recipientStatus: 'sent' })
    await send({ id: 2, sentAt: daysAgo(5), recipientStatus: 'clicked', clicks: 1 })

    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.sends_90d).toBe(1)
    expect(result.score).toBe(100)
  })

  it('zählt gebouncte Zustellungen nicht in den Nenner', async () => {
    await send({ id: 1, sentAt: daysAgo(6), recipientStatus: 'bounced' })
    await send({ id: 2, sentAt: daysAgo(5), recipientStatus: 'clicked', clicks: 1 })

    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.sends_90d).toBe(1)
    expect(result.score).toBe(100)
  })

  it('lässt klick-abgeleitete Signale den Score nicht aufblähen', async () => {
    // subscriber_open_signals enthält auch Zeilen mit source = 'clicked'.
    // Die frühere Formel zählte sie als Öffnungen und damit den Klick doppelt.
    await send({ id: 1, sentAt: daysAgo(5) })
    await db.run(sql`
      INSERT INTO subscriber_open_signals
        (site_id, subscriber_email, opened_at_utc, hour_local, weekday, tz_offset_minutes, source, is_bot_open)
      VALUES (${SITE}, ${EMAIL}, ${daysAgo(5)}, 9, 3, 60, 'clicked', 0)
    `)

    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.opens_90d).toBe(0)
    expect(result.score).toBe(0)
  })

  it('dämpft den Score, wenn der letzte Klick länger zurückliegt', async () => {
    await send({ id: 1, sentAt: daysAgo(70), recipientStatus: 'clicked', clicks: 1 })

    // recency_factor 0.4 im Fenster 60–90 Tage
    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.score).toBe(40)
    expect(result.tier).toBe('moderate')
  })

  it('gibt Score 0, wenn noch nichts verschickt wurde', async () => {
    const result = await computeEngagementScore(SITE, EMAIL)
    expect(result.sends_90d).toBe(0)
    expect(result.score).toBe(0)
  })
})
