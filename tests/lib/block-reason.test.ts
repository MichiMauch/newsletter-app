/**
 * Sperrgrund und Zurechnung zum Versand.
 *
 * Vorher setzten Abmeldung, Bounce und Beschwerde alle denselben Status
 * 'blocked' — man konnte weder sagen, warum jemand weg ist, noch eine
 * Abmelderate pro Versand berechnen.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Bewusst eine Datei statt ':memory:': blockSubscriberCompletely arbeitet in
// einer Transaktion, und libsql öffnet dafür eine zweite Verbindung. Bei
// ':memory:' wäre das eine komplett andere, leere Datenbank.
const DB_FILE = path.join(os.tmpdir(), `block-reason-${process.pid}.db`)
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(DB_FILE + suffix) } catch { /* gab es noch nicht */ }
}
process.env.TURSO_DB_URL = `file:${DB_FILE}`
process.env.TURSO_DB_TOKEN = ''

const { getDb } = await import('@/lib/db')
const { migrate } = await import('drizzle-orm/libsql/migrator')
const {
  blockSubscriberWithReason, blockSubscriberCompletely, createSubscriber,
} = await import('@/lib/newsletter-subscribers')

const db = getDb()
const SITE = 'kokomo'
const EMAIL = 'geht@example.com'

async function seed() {
  await db.run(sql`DELETE FROM subscriber_list_members`)
  await db.run(sql`DELETE FROM newsletter_recipients`)
  await db.run(sql`DELETE FROM newsletter_sends`)
  await db.run(sql`DELETE FROM newsletter_subscribers`)
  await db.run(sql`
    INSERT INTO newsletter_subscribers (site_id, email, status, token)
    VALUES (${SITE}, ${EMAIL}, 'active', 'tok-geht')
  `)
}

/** Trägt einen Versand ein, den diese Adresse erhalten hat. */
async function receivedSend(id: number, sentAt: string) {
  await db.run(sql`
    INSERT INTO newsletter_sends (id, site_id, post_slug, post_title, subject, sent_at, recipient_count, status)
    VALUES (${id}, ${SITE}, 'slug', 'Titel', 'Betreff', ${sentAt}, 1, 'sent')
  `)
  await db.run(sql`
    INSERT INTO newsletter_recipients (send_id, email, resend_email_id, status, delivered_at)
    VALUES (${id}, ${EMAIL}, ${`r-${id}`}, 'delivered', ${sentAt})
  `)
}

async function subscriber() {
  const r = await db.run(sql`
    SELECT status, blocked_reason, blocked_send_id FROM newsletter_subscribers WHERE email = ${EMAIL}
  `)
  return r.rows[0] as unknown as {
    status: string; blocked_reason: string | null; blocked_send_id: number | null
  }
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' })
})

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(DB_FILE + suffix) } catch { /* schon weg */ }
  }
})

beforeEach(seed)

describe('blockSubscriberWithReason', () => {
  it('hält den Grund fest', async () => {
    await blockSubscriberWithReason(SITE, EMAIL, 'bounced')

    const s = await subscriber()
    expect(s.status).toBe('blocked')
    expect(s.blocked_reason).toBe('bounced')
  })

  it('rechnet die Sperre dem zuletzt erhaltenen Versand zu', async () => {
    await receivedSend(1, '2026-04-08 06:41:13')
    await receivedSend(2, '2026-08-06 06:33:47')

    await blockSubscriberWithReason(SITE, EMAIL, 'complained')
    expect((await subscriber()).blocked_send_id).toBe(2)
  })

  it('kommt ohne jeden erhaltenen Versand aus', async () => {
    // Abmeldung direkt nach der Bestätigung — es gibt nichts zuzurechnen.
    await blockSubscriberWithReason(SITE, EMAIL, 'unsubscribed')

    const s = await subscriber()
    expect(s.blocked_reason).toBe('unsubscribed')
    expect(s.blocked_send_id).toBe(null)
  })

  it('überschreibt den Grund einer bereits gesperrten Adresse nicht', async () => {
    // Erst abgemeldet, danach kommt noch ein Bounce herein: der ursprüngliche
    // Grund ist der richtige, sonst würde eine Abmeldung nachträglich als
    // Zustellproblem gezählt.
    await blockSubscriberWithReason(SITE, EMAIL, 'unsubscribed')
    await blockSubscriberWithReason(SITE, EMAIL, 'bounced')

    expect((await subscriber()).blocked_reason).toBe('unsubscribed')
  })

  it('trennt nach Site', async () => {
    await blockSubscriberWithReason('andere-site', EMAIL, 'bounced')
    expect((await subscriber()).status).toBe('active')
  })
})

describe('blockSubscriberCompletely', () => {
  it('markiert die Abmeldung als solche', async () => {
    await receivedSend(1, '2026-08-06 06:33:47')

    await blockSubscriberCompletely('tok-geht')

    const s = await subscriber()
    expect(s.status).toBe('blocked')
    expect(s.blocked_reason).toBe('unsubscribed')
    expect(s.blocked_send_id).toBe(1)
  })
})

describe('Wiederanmeldung', () => {
  it('räumt den alten Sperrgrund weg', async () => {
    await receivedSend(1, '2026-08-06 06:33:47')
    await blockSubscriberCompletely('tok-geht')
    expect((await subscriber()).blocked_reason).toBe('unsubscribed')

    // Sonst zählte die alte Abmeldung für den Versand weiter mit, obwohl die
    // Person längst wieder dabei ist.
    await createSubscriber(SITE, EMAIL)

    const s = await subscriber()
    expect(s.status).toBe('pending')
    expect(s.blocked_reason).toBe(null)
    expect(s.blocked_send_id).toBe(null)
  })
})
