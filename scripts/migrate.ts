/**
 * Run Drizzle migrations against Turso (dev / manual)
 * Usage: npx tsx scripts/migrate.ts
 *
 * Mirrors the safety check in migrate-prod.mjs: after migrate, verify
 * the live DB matches the latest snapshot — see newsletter-app-9k3.
 */

import { config } from 'dotenv'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { verifySchemaAgainstLatestSnapshot } from './verify-schema.mjs'

config({ path: '.env.local' })

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle')

async function main() {
  const client = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })

  const db = drizzle(client)

  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  console.log('Migrator returned — verifying live schema...')

  const result = await verifySchemaAgainstLatestSnapshot(client, MIGRATIONS_DIR)
  if (!result.ok) {
    console.error(
      `Schema mismatch after migrating to ${result.snapshotTag}. Missing in live DB:`,
    )
    for (const m of result.missing) console.error(`  - ${m}`)
    console.error(
      'Migrator reported success but SQL was not applied. ' +
        'Likely cause: __drizzle_migrations journal hash mismatch with the .sql file. ' +
        'Inspect the journal and re-apply manually if needed.',
    )
    client.close()
    process.exit(2)
  }

  console.log('Schema verified. Migrations complete!')
  client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
