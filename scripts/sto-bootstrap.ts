/**
 * STO Bootstrap: erzeugt subscriber_send_time_profile Einträge aus historischen
 * newsletter_recipients.clicked_at-Daten. Einmalig nach Migration laufen lassen,
 * damit STO ab Tag 1 brauchbare Profile hat.
 *
 * Usage: npx tsx scripts/sto-bootstrap.ts [siteId]
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { bootstrapProfilesFromClicks } from '../lib/send-time-optimization'

async function main() {
  const siteId = process.argv[2] || 'kokomo'
  console.log(`[sto-bootstrap] Site: ${siteId}`)
  const result = await bootstrapProfilesFromClicks(siteId)
  console.log(`[sto-bootstrap] Done.`)
  console.log(`  Click-Signale erzeugt: ${result.signals_added}`)
  console.log(`  Profile gebaut:        ${result.profiles_built}`)
}

main().catch((err) => {
  console.error('[sto-bootstrap] Failed:', err)
  process.exit(1)
})
