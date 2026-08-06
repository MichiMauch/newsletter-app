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
const {
  updateRecipientEvent, isPermanentBounce, PERMANENT_BOUNCE_TYPE, hasClickedNewsletterLink,
  isUnsubscribeUrl,
} = await import('@/lib/newsletter-sends')
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

/** Zeitstempel `ms` Millisekunden nach T — für die Scanner-Fenster-Tests. */
function at(ms: number): string {
  return new Date(new Date(T).getTime() + ms).toISOString()
}

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
    // Zeitlich auseinander — so klickt ein Mensch, der die Mail nochmal aufmacht.
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(60_000), { click_url: 'https://example.com/b' })
    await updateRecipientEvent('resend-0', 'clicked', at(300_000), { click_url: 'https://example.com/c' })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(3)
  })

  it('zählt auch bei gleichzeitigen Klick-Webhooks nur einen Klicker', async () => {
    // Derselbe Link mehrfach, parallel zugestellt — etwa weil der Empfänger
    // schnell zweimal getippt hat. Anders als beim Scanner-Burst bleibt das
    // Engagement, nur der Klicker darf nicht mehrfach zählen.
    await Promise.all([
      updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' }),
      updateRecipientEvent('resend-0', 'clicked', at(400), { click_url: 'https://example.com/a' }),
      updateRecipientEvent('resend-0', 'clicked', at(900), { click_url: 'https://example.com/a' }),
    ])

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(3)
  })

  it('ignoriert eine erneut zugestellte Webhook-Meldung', async () => {
    // Resend stellt erneut zu, wenn unsere Antwort nicht 200 war. Gleicher
    // Empfänger, gleiche URL, gleiche Millisekunde = dasselbe Ereignis.
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })

    expect((await recipient('resend-0')).click_count).toBe(1)
    expect((await sendCounters()).clicked_count).toBe(1)
  })
})

describe('updateRecipientEvent — Klicks, die kein Engagement sind', () => {
  it('wertet einen Scanner-Burst nicht als Klick', async () => {
    // Drei verschiedene Links in 106 ms — exakt das Muster von
    // marek.rabe@rabenet.com im Versand vom 06.08.
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(8), { click_url: 'https://example.com/b' })
    await updateRecipientEvent('resend-0', 'clicked', at(106), { click_url: 'https://example.com/c' })

    expect((await sendCounters()).clicked_count).toBe(0)
    expect((await recipient('resend-0')).click_count).toBe(0)
    // Der Status darf nicht auf 'clicked' hängenbleiben.
    expect((await recipient('resend-0')).status).toBe('sent')
  })

  it('erfasst Scanner-Klicks trotzdem, statt sie wegzuwerfen', async () => {
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(8), { click_url: 'https://example.com/b' })
    await updateRecipientEvent('resend-0', 'clicked', at(106), { click_url: 'https://example.com/c' })

    const rows = await db.run(sql`SELECT is_bot FROM newsletter_link_clicks WHERE recipient_id = (SELECT id FROM newsletter_recipients WHERE resend_email_id = 'resend-0')`)
    expect(rows.rows.length).toBe(3)
    expect(rows.rows.every((r) => r.is_bot === 1)).toBe(true)
  })

  it('hält drei Klicks auf DIESELBE URL für echt', async () => {
    // Die Schwelle zählt verschiedene URLs. Mehrfach derselbe Link ist
    // menschliches Verhalten und darf nicht als Scanner gelten.
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(8), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(106), { click_url: 'https://example.com/a' })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(3)
  })

  it('hält zwei schnelle Klicks auf verschiedene Links für echt', async () => {
    // Bewusst unter der Schwelle: lieber einen Scanner übersehen als einen
    // echten Leser als Bot abstempeln.
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/a' })
    await updateRecipientEvent('resend-0', 'clicked', at(50), { click_url: 'https://example.com/b' })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(2)
  })

  it('wertet einen Abmeldeklick nicht als Engagement', async () => {
    await updateRecipientEvent('resend-0', 'clicked', at(0), {
      click_url: 'https://newsletter.kokomo.house/unsubscribe?token=abc',
    })

    expect((await sendCounters()).clicked_count).toBe(0)
    expect((await recipient('resend-0')).click_count).toBe(0)
  })

  it('zählt den Rest weiter, wenn nur der Abmeldeklick wegfällt', async () => {
    await updateRecipientEvent('resend-0', 'clicked', at(0), { click_url: 'https://example.com/artikel' })
    await updateRecipientEvent('resend-0', 'clicked', at(90_000), {
      click_url: 'https://newsletter.kokomo.house/unsubscribe?token=abc',
    })

    expect((await sendCounters()).clicked_count).toBe(1)
    expect((await recipient('resend-0')).click_count).toBe(1)
  })
})

describe('isUnsubscribeUrl', () => {
  it('erkennt Abmelde- und Einstellungslinks', () => {
    expect(isUnsubscribeUrl('https://newsletter.kokomo.house/unsubscribe?token=abc')).toBe(true)
    expect(isUnsubscribeUrl('https://example.com/ABMELDEN')).toBe(true)
    expect(isUnsubscribeUrl('https://example.com/preferences')).toBe(true)
  })

  it('hält normale Artikel-Links auseinander', () => {
    expect(isUnsubscribeUrl('https://www.kokomo.house/tiny-house/daemmung/')).toBe(false)
    // Kein blindes Teilstring-Matching: das Wort darf nicht mitten im Slug stehen.
    expect(isUnsubscribeUrl('https://www.kokomo.house/tiny-house/unsubscribed-leser/')).toBe(false)
  })
})

describe('updateRecipientEvent — Zwischenstände', () => {
  it('markiert eine verzögerte Zustellung als solche statt als Fehlschlag', async () => {
    await updateRecipientEvent('resend-0', 'delayed', T)

    expect((await recipient('resend-0')).status).toBe('delayed')
    // Verzögert ist kein Bounce — die Bounce-Zahl darf sich nicht bewegen.
    expect((await sendCounters()).bounced_count).toBe(0)
  })

  it('lässt aus einer verzögerten Mail eine zugestellte werden', async () => {
    await updateRecipientEvent('resend-0', 'delayed', T)
    await updateRecipientEvent('resend-0', 'delivered', T)

    expect((await recipient('resend-0')).status).toBe('delivered')
    expect((await sendCounters()).delivered_count).toBe(1)
  })

  it('dreht eine bereits zugestellte Mail nicht auf verzögert zurück', async () => {
    await updateRecipientEvent('resend-0', 'delivered', T)
    await updateRecipientEvent('resend-0', 'delayed', T)

    expect((await recipient('resend-0')).status).toBe('delivered')
  })

  it('hält failed und suppressed auseinander', async () => {
    await updateRecipientEvent('resend-0', 'failed', T)
    expect((await recipient('resend-0')).status).toBe('failed')

    await seedSend(['b@example.com'])
    await updateRecipientEvent('resend-0', 'suppressed', T)
    expect((await recipient('resend-0')).status).toBe('suppressed')
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

describe('hasClickedNewsletterLink', () => {
  // Grundlage der Automations-Bedingung "Hat Link geklickt", die vorher
  // hart auf false verdrahtet war und immer den Nein-Pfad genommen hat.
  const CLICKED = 'https://www.kokomo.house/tiny-house/daemmung-im-hitzetest/'

  async function recordClick(url: string, at: string) {
    await updateRecipientEvent('resend-0', 'clicked', at, { click_url: url })
  }

  it('findet einen Klick des Subscribers', async () => {
    await recordClick(CLICKED, T)
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com')).toBe(true)
  })

  it('meldet false ohne jeden Klick', async () => {
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com')).toBe(false)
  })

  it('filtert auf einen URL-Teilstring', async () => {
    await recordClick(CLICKED, T)
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com', { urlContains: 'hitzetest' })).toBe(true)
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com', { urlContains: 'quiz' })).toBe(false)
  })

  it('berücksichtigt nur Klicks ab dem Startzeitpunkt', async () => {
    await recordClick(CLICKED, '2026-08-06T06:00:00.000Z')
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com', { since: '2026-08-06T05:00:00.000Z' })).toBe(true)
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com', { since: '2026-08-06T07:00:00.000Z' })).toBe(false)
  })

  it('trennt nach Site', async () => {
    await recordClick(CLICKED, T)
    expect(await hasClickedNewsletterLink('andere-site', 'a@example.com')).toBe(false)
  })

  it('springt nicht auf einen Abmeldeklick an', async () => {
    // Sonst würde die Automation ausgerechnet dem hinterherlaufen, der sich
    // gerade abgemeldet hat.
    await recordClick('https://newsletter.kokomo.house/unsubscribe?token=abc', T)
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com')).toBe(false)
  })

  it('springt nicht auf einen Scanner-Burst an', async () => {
    await recordClick('https://example.com/a', at(0))
    await recordClick('https://example.com/b', at(8))
    await recordClick('https://example.com/c', at(106))
    expect(await hasClickedNewsletterLink('kokomo', 'a@example.com')).toBe(false)
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
