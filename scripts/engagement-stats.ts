import { config } from 'dotenv'
config({ path: '.env.local' })

import { getDb } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  const siteId = process.argv[2] || 'kokomo'
  const db = getDb()
  const rows = await db.run(sql`
    SELECT tier, COUNT(*) as count, ROUND(AVG(score), 1) as avg_score,
           SUM(opens_90d) as opens, SUM(clicks_90d) as clicks
    FROM subscriber_engagement
    WHERE site_id = ${siteId}
    GROUP BY tier
    ORDER BY avg_score DESC
  `)
  console.log('Engagement-Verteilung:')
  console.table(rows.rows)
}

main().catch(console.error)
