/**
 * Run Drizzle migrations against Turso
 * Usage: npx tsx scripts/migrate.ts
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

config({ path: '.env.local' })

async function main() {
  const client = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })

  const db = drizzle(client)

  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete!')
}

main().catch(console.error)
