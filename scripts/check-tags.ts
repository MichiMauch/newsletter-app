import { config } from 'dotenv'
import { createClient } from '@libsql/client'

config({ path: '.env.local' })

async function main() {
  const client = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })

  const all = await client.execute(`
    SELECT slug, tags_json FROM content_items WHERE site_id = 'kokomo' ORDER BY date DESC LIMIT 10
  `)

  console.log('Latest 10 content_items:')
  for (const row of all.rows) {
    console.log(`  ${String(row.slug).padEnd(50)}  ${row.tags_json}`)
  }

  const stats = await client.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN tags_json = '[]' OR tags_json IS NULL THEN 1 ELSE 0 END) as empty,
      SUM(CASE WHEN tags_json != '[]' AND tags_json IS NOT NULL THEN 1 ELSE 0 END) as with_tags
    FROM content_items WHERE site_id = 'kokomo'
  `)
  console.log('\nStats:', stats.rows[0])

  const sigs = await client.execute(`
    SELECT COUNT(*) as c FROM subscriber_tag_signals WHERE site_id = 'kokomo'
  `)
  console.log('subscriber_tag_signals rows:', sigs.rows[0])

  const subTags = await client.execute(`
    SELECT COUNT(*) as c FROM subscriber_tags WHERE site_id = 'kokomo'
  `)
  console.log('subscriber_tags rows:', subTags.rows[0])
}

main().catch(console.error)
