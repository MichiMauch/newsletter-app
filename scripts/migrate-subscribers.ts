/**
 * Phase 2, Step 2: Migrate subscribers from kokomo2026 Turso DB to newsletter-app DB
 * Usage: npx tsx scripts/migrate-subscribers.ts
 *
 * Requires two sets of env vars:
 *   SOURCE_TURSO_DB_URL / SOURCE_TURSO_DB_TOKEN  — kokomo2026 DB
 *   TURSO_DB_URL / TURSO_DB_TOKEN                — newsletter-app DB
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { newsletterSubscribers } from '../lib/schema'

config({ path: '.env.local' })

async function main() {
  const sourceClient = createClient({
    url: process.env.SOURCE_TURSO_DB_URL!,
    authToken: process.env.SOURCE_TURSO_DB_TOKEN!,
  })

  const targetClient = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })
  const targetDb = drizzle(targetClient)

  console.log('Reading subscribers from source DB...')
  const result = await sourceClient.execute('SELECT * FROM newsletter_subscribers ORDER BY id ASC')
  console.log(`Found ${result.rows.length} subscribers.`)

  let inserted = 0
  let skipped = 0

  for (const row of result.rows) {
    try {
      await targetDb.insert(newsletterSubscribers).values({
        siteId: 'kokomo',
        email: row.email as string,
        status: row.status as 'pending' | 'confirmed' | 'unsubscribed',
        token: row.token as string,
        createdAt: row.created_at as string,
        confirmedAt: row.confirmed_at as string | null,
        unsubscribedAt: row.unsubscribed_at as string | null,
      }).onConflictDoNothing()
      inserted++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('UNIQUE')) {
        skipped++
      } else {
        throw err
      }
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped (duplicates): ${skipped}`)
}

main().catch(console.error)
