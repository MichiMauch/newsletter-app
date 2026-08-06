/**
 * Stuft bestehende Zeilen in newsletter_link_clicks nachträglich ein.
 *
 * Die Spalten is_bot und is_unsubscribe kamen mit Migration 0021 dazu und
 * stehen für Altzeilen auf 0. Dieses Script wendet dieselben Regeln an, die
 * seither beim Eintreffen eines Klicks greifen (siehe isUnsubscribeUrl und
 * SCANNER_WINDOW_MS in lib/newsletter-sends.ts):
 *
 *   - Klicks auf Abmelde-/Einstellungslinks  -> is_unsubscribe
 *   - drei oder mehr VERSCHIEDENE URLs desselben Empfängers innerhalb von
 *     SCANNER_WINDOW_MS -> is_bot für das ganze Fenster
 *
 * Anschliessend müssen die Zähler neu abgeleitet werden:
 *   npx tsx scripts/repair-send-counters.ts --apply
 *
 *   npx tsx scripts/classify-link-clicks.ts            # nur anzeigen
 *   npx tsx scripts/classify-link-clicks.ts --apply    # schreiben
 */

import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { isUnsubscribeUrl, SCANNER_WINDOW_MS, SCANNER_DISTINCT_URLS } from '../lib/newsletter-sends'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

interface ClickRow {
  id: number
  recipient_id: number | null
  url: string
  clicked_at: string
  email: string
}

/**
 * Findet Scanner-Bursts in den Klicks EINES Empfängers.
 *
 * Schiebt ein Fenster über die zeitlich sortierten Klicks: sobald darin
 * SCANNER_DISTINCT_URLS verschiedene URLs liegen, gilt das ganze Fenster als
 * Scanner. Gleiche URL mehrfach zählt nicht — das ist menschliches Verhalten.
 */
function findScannerBursts(clicks: ClickRow[]): ClickRow[][] {
  const flagged = new Map<number, ClickRow>()
  const sorted = [...clicks].sort((a, b) => a.clicked_at.localeCompare(b.clicked_at))

  for (let start = 0; start < sorted.length; start++) {
    const windowStart = new Date(sorted[start].clicked_at).getTime()
    const inWindow: ClickRow[] = []
    for (let i = start; i < sorted.length; i++) {
      if (new Date(sorted[i].clicked_at).getTime() - windowStart > SCANNER_WINDOW_MS) break
      inWindow.push(sorted[i])
    }
    const distinctUrls = new Set(inWindow.map((c) => c.url))
    if (distinctUrls.size >= SCANNER_DISTINCT_URLS) {
      for (const c of inWindow) flagged.set(c.id, c)
    }
  }

  // Zu Bursts zusammenfassen, damit die Ausgabe pro Ereignis berichtet und
  // nicht eine Zeitspanne über Monate zwischen zwei getrennten Bursts zeigt.
  const bursts: ClickRow[][] = []
  let current: ClickRow[] = []
  for (const c of sorted) {
    if (!flagged.has(c.id)) continue
    const last = current[current.length - 1]
    const gap = last ? new Date(c.clicked_at).getTime() - new Date(last.clicked_at).getTime() : 0
    if (last && gap > SCANNER_WINDOW_MS) {
      bursts.push(current)
      current = []
    }
    current.push(c)
  }
  if (current.length > 0) bursts.push(current)
  return bursts
}

async function main() {
  const db = getDb()

  const rows = await db.run(sql`
    SELECT lc.id, lc.recipient_id, lc.url, lc.clicked_at, r.email
    FROM newsletter_link_clicks lc
    LEFT JOIN newsletter_recipients r ON r.id = lc.recipient_id
    ORDER BY lc.recipient_id, lc.clicked_at
  `)
  const clicks = rows.rows as unknown as ClickRow[]
  console.log(`${clicks.length} Klicks insgesamt.\n`)

  const unsubscribeIds = clicks.filter((c) => isUnsubscribeUrl(c.url)).map((c) => c.id)

  const byRecipient = new Map<number, ClickRow[]>()
  for (const c of clicks) {
    if (c.recipient_id === null) continue
    const list = byRecipient.get(c.recipient_id) ?? []
    list.push(c)
    byRecipient.set(c.recipient_id, list)
  }

  const bursts: ClickRow[][] = []
  for (const [, recipientClicks] of byRecipient) {
    bursts.push(...findScannerBursts(recipientClicks))
  }
  const botIds = new Set(bursts.flat().map((c) => c.id))

  const byId = new Map(clicks.map((c) => [c.id, c]))
  if (unsubscribeIds.length > 0) {
    console.log(`Abmeldeklicks (${unsubscribeIds.length}):`)
    for (const id of unsubscribeIds) console.log(`  ${byId.get(id)?.email ?? '?'}`)
  }
  if (bursts.length > 0) {
    console.log(`\nScanner-Klicks (${botIds.size} in ${bursts.length} Bursts):`)
    const sortedBursts = [...bursts].sort((a, b) => a[0].clicked_at.localeCompare(b[0].clicked_at))
    for (const burst of sortedBursts) {
      const spanMs = new Date(burst[burst.length - 1].clicked_at).getTime()
        - new Date(burst[0].clicked_at).getTime()
      const urls = new Set(burst.map((c) => c.url)).size
      console.log(`  ${burst[0].email} · Send ${burst[0].clicked_at.slice(0, 10)}: ${urls} Links in ${spanMs} ms`)
    }
  }
  if (unsubscribeIds.length === 0 && botIds.size === 0) {
    console.log('Nichts zu klassifizieren.')
    return
  }

  if (!APPLY) {
    console.log('\nProbelauf — nichts geschrieben. Mit --apply ausführen.')
    return
  }

  for (const id of unsubscribeIds) {
    await db.run(sql`UPDATE newsletter_link_clicks SET is_unsubscribe = 1 WHERE id = ${id}`)
  }
  for (const id of botIds) {
    await db.run(sql`UPDATE newsletter_link_clicks SET is_bot = 1 WHERE id = ${id}`)
  }
  console.log('\nKlassifiziert. Jetzt noch: npx tsx scripts/repair-send-counters.ts --apply')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
