/**
 * Wendet die Bounce-Sperrregeln rückwirkend auf den Bestand an.
 *
 * Nötig, weil die alte Regel ("3 Bounces in 90 Tagen") bei einem Newsletter,
 * der alle ein bis vier Monate erscheint, nie auslösen konnte: die älteren
 * Bounces fielen jedes Mal aus dem Fenster, bevor ein neuer dazukam. Adressen,
 * die bei JEDEM Versand gebounct sind, stehen deshalb bis heute auf 'active'.
 *
 * Angewandt werden dieselben Regeln, die seither live greifen
 * (siehe getBounceStreak / streakWarrantsBlock in lib/newsletter-sends.ts):
 *   - Bounce-Typ 'Permanent'                        -> sofort sperren
 *   - 3 Bounces in Folge ohne Zustellung dazwischen -> sperren
 *   - 2 Bounces in Folge, beide 'Undetermined'      -> sperren
 *
 *   npx tsx scripts/apply-bounce-rules.ts            # nur anzeigen
 *   npx tsx scripts/apply-bounce-rules.ts --apply    # sperren
 */

import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { getBounceStreak, streakWarrantsBlock, isPermanentBounce } from '../lib/newsletter-sends'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

async function main() {
  const db = getDb()

  // Nur aktive Adressen, die überhaupt je gebounct sind — alles andere kann
  // die Regel gar nicht treffen.
  const candidates = await db.run(sql`
    SELECT DISTINCT s.site_id, s.email
    FROM newsletter_subscribers s
    JOIN newsletter_recipients nr ON nr.email = s.email
    JOIN newsletter_sends ns ON ns.id = nr.send_id AND ns.site_id = s.site_id
    WHERE s.status = 'active' AND nr.status = 'bounced'
    ORDER BY s.email
  `)

  if (candidates.rows.length === 0) {
    console.log('Keine aktive Adresse mit Bounce-Historie.')
    return
  }

  const toBlock: { siteId: string; email: string; reason: string }[] = []

  for (const row of candidates.rows) {
    const siteId = row.site_id as string
    const email = row.email as string

    const permanent = await db.run(sql`
      SELECT 1 AS hit
      FROM newsletter_recipients nr
      JOIN newsletter_sends ns ON ns.id = nr.send_id
      WHERE nr.email = ${email} AND ns.site_id = ${siteId}
        AND nr.status = 'bounced' AND nr.bounce_type IS NOT NULL
      LIMIT 1
    `)
    const permanentTypes = await db.run(sql`
      SELECT DISTINCT nr.bounce_type
      FROM newsletter_recipients nr
      JOIN newsletter_sends ns ON ns.id = nr.send_id
      WHERE nr.email = ${email} AND ns.site_id = ${siteId} AND nr.status = 'bounced'
    `)
    const hasPermanent = permanent.rows.length > 0
      && permanentTypes.rows.some((r) => isPermanentBounce(r.bounce_type as string | null))

    const streak = await getBounceStreak(siteId, email)

    if (hasPermanent) {
      toBlock.push({ siteId, email, reason: 'Hard Bounce (Permanent)' })
    } else if (streakWarrantsBlock(streak)) {
      const kind = streak.allUndetermined ? 'Undetermined' : 'Soft'
      toBlock.push({ siteId, email, reason: `${streak.count}× ${kind}-Bounce in Folge, nie zugestellt dazwischen` })
    } else if (streak.count > 0) {
      console.log(`  bleibt aktiv — ${email}: ${streak.count} Bounce(s) in Folge, unter der Schwelle`)
    }
  }

  if (toBlock.length === 0) {
    console.log('\nKeine Adresse erreicht die Sperr-Schwelle.')
    return
  }

  console.log(`\n${toBlock.length} Adresse(n) zu sperren:`)
  for (const b of toBlock) console.log(`  ${b.email} — ${b.reason}`)

  if (!APPLY) {
    console.log('\nProbelauf — nichts geschrieben. Mit --apply ausführen.')
    return
  }

  for (const b of toBlock) {
    await db.run(sql`
      UPDATE newsletter_subscribers
      SET status = 'blocked', blocked_at = datetime('now')
      WHERE site_id = ${b.siteId} AND email = ${b.email} AND status = 'active'
    `)
  }
  console.log(`\n${toBlock.length} Adresse(n) gesperrt.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
