/**
 * Leitet für bereits gesperrte Adressen nach, WARUM sie gesperrt wurden.
 *
 * Bis Migration 0023 setzten Abmeldung, Bounce und Beschwerde denselben Status
 * 'blocked', ohne Grund dahinter. Für Bestandszeilen lässt sich der Grund nur
 * dort rekonstruieren, wo es Spuren gibt:
 *
 *   - Beschwerde-Zeile in newsletter_recipients  -> 'complained'
 *   - Bounce-Zeile in newsletter_recipients      -> 'bounced'
 *   - sonst                                      -> bleibt NULL
 *
 * Der Rest bleibt bewusst unbekannt statt geraten. Wer keine Bounce- oder
 * Beschwerde-Spur hat, HAT sich vermutlich abgemeldet — aber "vermutlich"
 * gehört nicht in eine Kennzahl, die später als Abmelderate ausgewiesen wird.
 * Diese Adressen tauchen deshalb in keiner Rate auf.
 *
 *   npx tsx scripts/backfill-block-reason.ts            # nur anzeigen
 *   npx tsx scripts/backfill-block-reason.ts --apply    # schreiben
 */

import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

async function main() {
  const db = getDb()

  const rows = await db.run(sql`
    SELECT s.id, s.site_id, s.email, s.blocked_at,
      (SELECT COUNT(*) FROM newsletter_recipients nr
       JOIN newsletter_sends ns ON ns.id = nr.send_id AND ns.site_id = s.site_id
       WHERE nr.email = s.email AND nr.status = 'complained') AS complaints,
      (SELECT COUNT(*) FROM newsletter_recipients nr
       JOIN newsletter_sends ns ON ns.id = nr.send_id AND ns.site_id = s.site_id
       WHERE nr.email = s.email AND nr.status = 'bounced') AS bounces,
      (SELECT ns.id FROM newsletter_recipients nr
       JOIN newsletter_sends ns ON ns.id = nr.send_id AND ns.site_id = s.site_id
       WHERE nr.email = s.email AND ns.status = 'sent'
       ORDER BY ns.sent_at DESC LIMIT 1) AS last_send_id,
      -- Klick auf den Abmeldelink: die genaueste Spur, die es gibt. Sie nennt
      -- nicht nur den Grund, sondern auch den auslösenden Versand — besser als
      -- die Ersatzzurechnung "letzter erhaltener Versand".
      (SELECT lc.send_id FROM newsletter_link_clicks lc
       JOIN newsletter_recipients nr ON nr.id = lc.recipient_id
       JOIN newsletter_sends ns ON ns.id = lc.send_id AND ns.site_id = s.site_id
       WHERE nr.email = s.email AND lc.is_unsubscribe = 1
       ORDER BY lc.clicked_at DESC LIMIT 1) AS unsub_click_send_id
    FROM newsletter_subscribers s
    WHERE s.status = 'blocked' AND s.blocked_reason IS NULL
    ORDER BY s.email
  `)

  if (rows.rows.length === 0) {
    console.log('Keine gesperrte Adresse ohne Grund.')
    return
  }

  const updates: { id: number; email: string; reason: string; sendId: number | null }[] = []
  const unknown: string[] = []

  for (const r of rows.rows) {
    const email = r.email as string
    const unsubClickSendId = (r.unsub_click_send_id as number | null) ?? null

    // Reihenfolge nach Verlässlichkeit: eine Beschwerde oder ein Bounce ist ein
    // harter Befund, der Klick auf den Abmeldelink ebenfalls. Alles andere
    // bleibt offen.
    const reason = (r.complaints as number) > 0 ? 'complained'
      : (r.bounces as number) > 0 ? 'bounced'
      : unsubClickSendId !== null ? 'unsubscribed'
      : null
    if (reason === null) {
      unknown.push(email)
      continue
    }
    updates.push({
      id: r.id as number,
      email,
      reason,
      // Beim Abmeldeklick kennen wir den auslösenden Versand exakt.
      sendId: reason === 'unsubscribed'
        ? unsubClickSendId
        : (r.last_send_id as number | null) ?? null,
    })
  }

  console.log(`${rows.rows.length} gesperrte Adresse(n) ohne Grund.\n`)
  for (const u of updates) console.log(`  ${u.email} -> ${u.reason}`)
  if (unknown.length > 0) {
    console.log(`\n  nicht herleitbar, bleibt offen (${unknown.length}):`)
    for (const e of unknown) console.log(`    ${e}`)
  }

  if (!APPLY) {
    console.log('\nProbelauf — nichts geschrieben. Mit --apply ausführen.')
    return
  }
  if (updates.length === 0) return

  for (const u of updates) {
    await db.run(sql`
      UPDATE newsletter_subscribers
      SET blocked_reason = ${u.reason}, blocked_send_id = ${u.sendId}
      WHERE id = ${u.id}
    `)
  }
  console.log(`\n${updates.length} Adresse(n) ergänzt.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
