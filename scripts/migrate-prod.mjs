// Production-safe migration runner.
//
// Plain .mjs (no tsx / no devDeps required) so it can run from `npm start` on
// a production Coolify deploy where devDependencies may be pruned. Reads env
// straight from process.env — Coolify injects TURSO_DB_URL + TURSO_DB_TOKEN.
//
// Idempotent: drizzle's migrator uses the __drizzle_migrations journal table
// to skip already-applied migrations, so multiple instances spinning up at
// the same time will all converge on the same schema without conflict.

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

async function main() {
  const url = process.env.TURSO_DB_URL
  if (!url) {
    console.error('[migrate-prod] TURSO_DB_URL is not set — refusing to run.')
    process.exit(1)
  }

  console.log(`[migrate-prod] Migrating ${url} …`)
  const client = createClient({
    url,
    authToken: process.env.TURSO_DB_TOKEN || undefined,
  })
  const db = drizzle(client)

  await migrate(db, { migrationsFolder: path.join(ROOT, 'drizzle') })
  console.log('[migrate-prod] Migrations up to date.')
  client.close()
}

main().catch((err) => {
  console.error('[migrate-prod] FAILED:', err)
  process.exit(1)
})
