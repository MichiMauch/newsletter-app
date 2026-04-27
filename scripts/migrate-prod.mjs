// Production-safe migration runner.
//
// Plain .mjs (no tsx / no devDeps required) so it can run from `npm start` on
// a production Coolify deploy where devDependencies may be pruned. Reads env
// straight from process.env — Coolify injects TURSO_DB_URL + TURSO_DB_TOKEN.
//
// Idempotent: drizzle's migrator uses the __drizzle_migrations journal table
// to skip already-applied migrations, so multiple instances spinning up at
// the same time will all converge on the same schema without conflict.
//
// Sanity check: after migrate, we re-read the latest Drizzle snapshot and
// assert every table/column actually exists. The migrator has been observed
// to silently report "complete" while skipping ALTER statements (see
// newsletter-app-9k3) — refusing to start a half-migrated server is far
// better than 500s on first request.

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifySchemaAgainstLatestSnapshot } from './verify-schema.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MIGRATIONS_DIR = path.join(ROOT, 'drizzle')

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

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  console.log('[migrate-prod] Migrator returned — verifying live schema …')

  const result = await verifySchemaAgainstLatestSnapshot(client, MIGRATIONS_DIR)
  if (!result.ok) {
    console.error(
      `[migrate-prod] FAILED: schema mismatch after migrating to ${result.snapshotTag}.`,
    )
    console.error('[migrate-prod] Missing in live DB:')
    for (const m of result.missing) console.error(`  - ${m}`)
    console.error(
      '[migrate-prod] The migrator reported success but the SQL was not applied. ' +
        'Refusing to start with a broken schema.',
    )
    client.close()
    process.exit(1)
  }

  console.log('[migrate-prod] Schema verified. Migrations up to date.')
  client.close()
}

main().catch((err) => {
  console.error('[migrate-prod] FAILED:', err)
  process.exit(1)
})
