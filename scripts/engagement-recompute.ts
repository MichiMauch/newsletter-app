/**
 * Initial Engagement-Score Recompute für alle confirmed Subscribers.
 * Einmalig nach Migration laufen lassen — danach übernimmt der Cron.
 *
 * Usage: npx tsx scripts/engagement-recompute.ts [siteId]
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { recomputeAllEngagement } from '../lib/engagement'

async function main() {
  const siteId = process.argv[2] || 'kokomo'
  console.log(`[engagement] Recompute für site=${siteId}…`)
  const result = await recomputeAllEngagement(siteId)
  console.log(`[engagement] ${result.updated} Subscribers aktualisiert.`)
}

main().catch((err) => {
  console.error('[engagement] Failed:', err)
  process.exit(1)
})
