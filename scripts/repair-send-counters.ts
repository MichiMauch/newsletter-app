/**
 * Rechnet die Aggregat-Zähler in newsletter_sends (und newsletter_send_variants)
 * aus den Empfängerzeilen neu.
 *
 * Hintergrund: bis zum Fix in updateRecipientEvent wurde "ist das der erste
 * Klick?" in der Applikation entschieden statt im WHERE des UPDATEs. Bei
 * parallelen Webhooks — typisch für Mail-Security-Scanner, die mehrere Links im
 * selben Millisekundenfenster abrufen — zählten mehrere Aufrufe denselben
 * Klicker mehrfach. newsletter_recipients ist dabei immer korrekt geblieben und
 * dient hier als Quelle der Wahrheit.
 *
 * Idempotent: mehrfaches Ausführen ändert nach dem ersten Lauf nichts mehr.
 *
 *   npx tsx scripts/repair-send-counters.ts            # nur anzeigen
 *   npx tsx scripts/repair-send-counters.ts --apply    # schreiben
 */

import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

interface Drift {
  id: number
  subject: string
  field: string
  stored: number
  actual: number
}

async function main() {
  const db = getDb()

  // delivered = jede Zeile mit Zustellzeitpunkt (status kann schon 'clicked' sein).
  // clicked   = Empfänger mit mindestens einem Engagement-Klick, also ohne
  //             Scanner- und Abmeldeklicks. Quelle ist newsletter_link_clicks,
  //             nicht recipients.click_count — dort steht dasselbe abgeleitete
  //             Ergebnis, das hier gerade überprüft wird.
  const rows = await db.run(sql`
    SELECT
      s.id, s.subject,
      s.delivered_count, s.clicked_count, s.bounced_count, s.complained_count,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = s.id AND r.delivered_at IS NOT NULL) AS actual_delivered,
      (SELECT COUNT(DISTINCT lc.recipient_id) FROM newsletter_link_clicks lc
         WHERE lc.send_id = s.id AND lc.recipient_id IS NOT NULL
           AND lc.is_bot = 0 AND lc.is_unsubscribe = 0)                                                     AS actual_clicked,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = s.id AND r.status = 'bounced')        AS actual_bounced,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = s.id AND r.status = 'complained')     AS actual_complained
    FROM newsletter_sends s
    ORDER BY s.id
  `)

  const drifts: Drift[] = []
  for (const r of rows.rows) {
    const id = r.id as number
    const subject = r.subject as string
    const pairs: [string, number, number][] = [
      ['delivered_count', r.delivered_count as number, r.actual_delivered as number],
      ['clicked_count', r.clicked_count as number, r.actual_clicked as number],
      ['bounced_count', r.bounced_count as number, r.actual_bounced as number],
      ['complained_count', r.complained_count as number, r.actual_complained as number],
    ]
    for (const [field, stored, actual] of pairs) {
      if (stored !== actual) drifts.push({ id, subject, field, stored, actual })
    }
  }

  if (drifts.length === 0) {
    console.log('Alle Zähler stimmen mit den Empfängerzeilen überein.')
  } else {
    console.log(`${drifts.length} abweichende Zähler:\n`)
    for (const d of drifts) {
      console.log(`  Send ${d.id} · ${d.field}: ${d.stored} → ${d.actual}   (${d.subject.slice(0, 50)})`)
    }
  }

  // Varianten-Zähler (A/B-Tests) hängen an derselben Race Condition.
  const variantRows = await db.run(sql`
    SELECT v.id, v.send_id, v.label, v.delivered_count, v.clicked_count, v.bounced_count, v.complained_count,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = v.send_id AND r.variant_label = v.label AND r.delivered_at IS NOT NULL) AS actual_delivered,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = v.send_id AND r.variant_label = v.label AND r.click_count > 0)           AS actual_clicked,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = v.send_id AND r.variant_label = v.label AND r.status = 'bounced')        AS actual_bounced,
      (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = v.send_id AND r.variant_label = v.label AND r.status = 'complained')     AS actual_complained
    FROM newsletter_send_variants v
  `)
  const variantDrift = variantRows.rows.filter((v) =>
    v.delivered_count !== v.actual_delivered || v.clicked_count !== v.actual_clicked ||
    v.bounced_count !== v.actual_bounced || v.complained_count !== v.actual_complained)
  if (variantDrift.length > 0) {
    console.log(`\n${variantDrift.length} abweichende Varianten-Zähler.`)
  }

  if (!APPLY) {
    console.log('\nProbelauf — nichts geschrieben. Mit --apply ausführen.')
    return
  }
  if (drifts.length === 0 && variantDrift.length === 0) return

  // Zuerst die Empfängerzeilen: click_count ist selbst abgeleitet und muss
  // stimmen, bevor irgendetwas darauf aufbaut.
  await db.run(sql`
    UPDATE newsletter_recipients SET
      click_count = (SELECT COUNT(*) FROM newsletter_link_clicks lc
                     WHERE lc.recipient_id = newsletter_recipients.id AND lc.is_bot = 0 AND lc.is_unsubscribe = 0),
      clicked_at  = (SELECT MIN(lc.clicked_at) FROM newsletter_link_clicks lc
                     WHERE lc.recipient_id = newsletter_recipients.id AND lc.is_bot = 0 AND lc.is_unsubscribe = 0),
      status = CASE
        WHEN status IN ('bounced', 'complained') THEN status
        WHEN (SELECT COUNT(*) FROM newsletter_link_clicks lc
              WHERE lc.recipient_id = newsletter_recipients.id AND lc.is_bot = 0 AND lc.is_unsubscribe = 0) > 0 THEN 'clicked'
        WHEN status = 'clicked' AND delivered_at IS NOT NULL THEN 'delivered'
        WHEN status = 'clicked' THEN 'sent'
        ELSE status
      END
  `)
  await db.run(sql`
    UPDATE newsletter_sends SET
      delivered_count  = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_sends.id AND r.delivered_at IS NOT NULL),
      clicked_count    = (SELECT COUNT(DISTINCT lc.recipient_id) FROM newsletter_link_clicks lc
                          WHERE lc.send_id = newsletter_sends.id AND lc.recipient_id IS NOT NULL
                            AND lc.is_bot = 0 AND lc.is_unsubscribe = 0),
      bounced_count    = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_sends.id AND r.status = 'bounced'),
      complained_count = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_sends.id AND r.status = 'complained')
  `)
  await db.run(sql`
    UPDATE newsletter_send_variants SET
      delivered_count  = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_send_variants.send_id AND r.variant_label = newsletter_send_variants.label AND r.delivered_at IS NOT NULL),
      clicked_count    = (SELECT COUNT(DISTINCT lc.recipient_id) FROM newsletter_link_clicks lc
                          JOIN newsletter_recipients r ON r.id = lc.recipient_id
                          WHERE lc.send_id = newsletter_send_variants.send_id AND r.variant_label = newsletter_send_variants.label
                            AND lc.is_bot = 0 AND lc.is_unsubscribe = 0),
      bounced_count    = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_send_variants.send_id AND r.variant_label = newsletter_send_variants.label AND r.status = 'bounced'),
      complained_count = (SELECT COUNT(*) FROM newsletter_recipients r WHERE r.send_id = newsletter_send_variants.send_id AND r.variant_label = newsletter_send_variants.label AND r.status = 'complained')
  `)
  console.log('\nZähler neu berechnet.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
