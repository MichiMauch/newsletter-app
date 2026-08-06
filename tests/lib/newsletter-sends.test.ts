/**
 * Zähl-Logik von updateRecipientEvent gegen eine echte SQLite-DB.
 *
 * Diese Tests brauchen bewusst eine Datenbank statt Mocks: der Fehler, den sie
 * absichern, lag genau darin, dass die "ist das der erste Klick?"-Entscheidung
 * in der Applikation getroffen wurde statt im WHERE des UPDATEs. Ein Mock würde
 * die Race Condition wegdefinieren.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'

// Muss vor dem Import von lib/db gesetzt sein — getDb liest die URL beim ersten Aufruf.
process.env.TURSO_DB_URL = ':memory:'
process.env.TURSO_DB_TOKEN = ''

const { getDb } = await import('@/lib/db')
const { migrate } = await import('drizzle-orm/libsql/migrator')
const { updateRecipientEvent, isPermanentBounce, PERMANENT_BOUNCE_TYPE } = await import('@/lib/newsletter-sends')
const { bounceMetadata } = await import('@/lib/newsletter-bounces')

const db = getDb()
const SEND_ID = 1

async function seedSend(recipientEmails: string[]) {
  await db.run(sql`DELETE FROM newsletter_link_clicks`)
  await db.run(sql`DELETE FROM newsletter_recipients`)
  await db.run(sql`DELETE FROM newsletter_sends`)
  await db.run(sql`DELETE FROM newsletter_subscribers`)
  await db.run(sql`
    INSERT INTO newsletter_sends (id, site_id, post_slug, post_title, subject, recipient_count, status)
    VALUES (${SEND_ID}, 'kokomo', 'slug', 'Titel', 'Betreff', ${recipientEmails.length}, 'sent')
  `)
  for (const [i, email] of recipientEmails.entries()) {
    await db.run(sql`
      INSERT INTO newsletter_recipients (send_id, email, resend_email_id, status)
      VALUES (${SEND_ID}, ${email}, ${`resend-${i}`}, 'sent')
    `)
    await db.run(sql`
      INSERT INTO newsletter_subscribers (site_id, email, status, token)
      VALUES ('kokomo', ${email}, 'active', ${`token-${i}`})
    `)
  }
}

async function sendCounters() {
  const r = await db.run(sql`
    SELECT delivered_count, clicked_count, bounced_count, complained_count
    FROM newsletter_sends WHERE id = ${SEND_ID}
  `)
  return r.rows[0] as unknown as {
    delivered_count: number; clicked_count: number
    bounced_count: number; complained_count: number
  }
}

async function recipient(resendId: string) {
  const r = await db.run(sql`
    SELECT status, click_count, delivered_at, bounce_type, bounce_sub_type
    FROM newsletter_recipients WHERE resend_email_id = ${resendId}
  `)
  return r.rows[0] as unknown as {
    status: string; click_count: number; delivered_at: string | null
    bounce_type: string | null; bounce_sub_type: string | null
  }
}

const T = '2026-08-06T06:34:57.885Z'

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  await seedSend(['a@example.com'])
})

describe('updateRecipientEvent — Klick-Zählung', () => {
  it('zählt den ersten Klick genau einmal ins Send-Aggregat', async () => {
    await updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/a' })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(1)
  })

  it('zählt Folgeklicks auf der Empfängerzeile, aber nicht im Aggregat', async () => {
    await updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/b' })
    await updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/c' })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(3)
  })

  it('zählt auch bei gleichzeitigen Klick-Webhooks nur einen Klicker', async () => {
    // Das ist der reale Fall: ein Link-Scanner ruft mehrere Links im selben
    // Millisekundenfenster ab, Resend feuert die Webhooks parallel. Vorher
    // lasen alle drei click_count = 0 und erhöhten clicked_count auf 3.
    await Promise.all([
      updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/a' }),
      updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/b' }),
      updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/c' }),
    ])

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(3)
  })
})

describe('updateRecipientEvent — Zustellung', () => {
  it('zählt eine wiederholte Zustell-Benachrichtigung nicht doppelt', async () => {
    await updateRecipientEvent('resend-0', 'delivered', T)
    await updateRecipientEvent('resend-0', 'delivered', T)

    expect((await sendCounters()).delivered_count).toBe(1)
  })

  it('zählt die Zustellung auch dann, wenn der Klick-Webhook zuerst ankam', async () => {
    // Reihenfolge ist bei Webhooks nicht garantiert. delivered_at IS NULL ist
    // der Marker, nicht status = 'sent' — sonst geht die Zustellung verloren.
    await updateRecipientEvent('resend-0', 'clicked', T, { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'delivered', T)

    const counters = await sendCounters()
    expect(counters.delivered_count).toBe(1)
    expect(counters.clicked_count).toBe(1)
    // Der aussagekräftigere Status bleibt stehen.
    expect((await recipient('resend-0')).status).toBe('clicked')
    expect((await recipient('resend-0')).delivered_at).toBe(T)
  })
})

describe('updateRecipientEvent — Bounces', () => {
  it('speichert Typ und Subtyp aus dem Resend-Format', async () => {
    await updateRecipientEvent('resend-0', 'bounced', T, bounceMetadata({
      type: 'Permanent', subType: 'NoEmail', message: 'Adresse existiert nicht',
    }))

    const r = await recipient('resend-0')
    expect(r.bounce_type).toBe('Permanent')
    expect(r.bounce_sub_type).toBe('NoEmail')
    expect((await sendCounters()).bounced_count).toBe(1)
  })

  it('sperrt den Subscriber bei einem Permanent-Bounce sofort', async () => {
    await updateRecipientEvent('resend-0', 'bounced', T, bounceMetadata({ type: 'Permanent' }))

    const r = await db.run(sql`SELECT status FROM newsletter_subscribers WHERE email = 'a@example.com'`)
    expect(r.rows[0].status).toBe('blocked')
  })

  it('sperrt bei einem Transient-Bounce nicht', async () => {
    await updateRecipientEvent('resend-0', 'bounced', T, bounceMetadata({ type: 'Transient' }))

    const r = await db.run(sql`SELECT status FROM newsletter_subscribers WHERE email = 'a@example.com'`)
    expect(r.rows[0].status).toBe('active')
  })

  it('zählt ein wiederholtes Bounce-Event nicht doppelt', async () => {
    await updateRecipientEvent('resend-0', 'bounced', T, bounceMetadata({ type: 'Transient' }))
    await updateRecipientEvent('resend-0', 'bounced', T, bounceMetadata({ type: 'Transient' }))

    expect((await sendCounters()).bounced_count).toBe(1)
  })
})

describe('bounceMetadata', () => {
  it('mappt Resends Feldnamen auf die internen Spalten', () => {
    expect(bounceMetadata({ type: 'Transient', subType: 'General', message: 'Mailbox voll' })).toEqual({
      bounce_type: 'Transient',
      bounce_sub_type: 'General',
      bounce_message: 'Mailbox voll',
    })
  })

  it('hängt den diagnosticCode an die Message', () => {
    const result = bounceMetadata({
      type: 'Transient',
      message: 'Allgemeiner Bounce',
      diagnosticCode: ['smtp; 554 5.7.1 Relay access denied'],
    })
    expect(result?.bounce_message).toBe('Allgemeiner Bounce — smtp; 554 5.7.1 Relay access denied')
  })

  it('kommt ohne Bounce-Objekt klar', () => {
    expect(bounceMetadata(undefined)).toBeUndefined()
  })
})

describe('isPermanentBounce', () => {
  it('erkennt Resends Permanent-Klassifikation', () => {
    expect(isPermanentBounce(PERMANENT_BOUNCE_TYPE)).toBe(true)
    expect(isPermanentBounce('permanent')).toBe(true)
  })

  it('behandelt alles andere als nicht-permanent', () => {
    expect(isPermanentBounce('Transient')).toBe(false)
    expect(isPermanentBounce('Undetermined')).toBe(false)
    // Alt-Datensätze aus der Zeit, als der Typ nie ankam.
    expect(isPermanentBounce(null)).toBe(false)
    expect(isPermanentBounce(undefined)).toBe(false)
    // Der frühere Vergleichswert, den Resend nie geschickt hat.
    expect(isPermanentBounce('hard')).toBe(false)
  })
})
