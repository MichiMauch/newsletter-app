/**
 * Prepare a clean SQLite test database for Playwright runs.
 *
 * Steps:
 *   1. Delete any existing test.db so each run starts fresh.
 *   2. Apply all Drizzle migrations from /drizzle.
 *   3. Seed: a default site + 5 confirmed subscribers + 3 content items.
 *
 * Idempotent — safe to run multiple times. Called from scripts/e2e-server.ts
 * before next dev boots, and standalone via `npm run db:migrate-test`.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../lib/schema'

config({ path: '.env.test' })

const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'test.db')
const ARTIFACTS_DIR = path.join(ROOT, '.test-artifacts')

async function rmIfExists(p: string) {
  try {
    await fs.unlink(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

async function resetDb() {
  await rmIfExists(DB_FILE)
  await rmIfExists(`${DB_FILE}-journal`)
  await rmIfExists(`${DB_FILE}-shm`)
  await rmIfExists(`${DB_FILE}-wal`)
}

async function clearArtifacts() {
  try {
    await fs.rm(ARTIFACTS_DIR, { recursive: true, force: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

async function main() {
  if (!process.env.TURSO_DB_URL?.startsWith('file:')) {
    throw new Error(
      `Refusing to run e2e-setup against a non-file DB (TURSO_DB_URL=${process.env.TURSO_DB_URL}). ` +
      'Did you forget to load .env.test?',
    )
  }

  console.log('[e2e-setup] Resetting test DB + artifacts…')
  await resetDb()
  await clearArtifacts()

  const client = createClient({
    url: process.env.TURSO_DB_URL,
    authToken: process.env.TURSO_DB_TOKEN || undefined,
  })
  const db = drizzle(client, { schema })

  console.log('[e2e-setup] Running migrations…')
  await migrate(db, { migrationsFolder: path.join(ROOT, 'drizzle') })

  console.log('[e2e-setup] Seeding…')

  // Default site
  await db.insert(schema.sites).values({
    id: 'kokomo',
    name: 'Kokomo (E2E)',
    siteUrl: 'http://127.0.0.1:3100',
    primaryColor: '#017734',
    accentColor: '#05DE66',
    gradientEnd: '#01ABE7',
    fontFamily: 'Poppins',
    fromEmail: 'test@e2e.local',
    fromName: 'E2E Test',
    socialLinksJson: '{}',
    allowedOrigin: 'http://127.0.0.1:3100',
    locale: 'de-CH',
  })

  // Subscribers — deterministic tokens so tests can hit the unsubscribe link
  const subscribers = [
    { email: 'alice@e2e.test', token: 't-alice', status: 'confirmed' as const },
    { email: 'bob@e2e.test', token: 't-bob', status: 'confirmed' as const },
    { email: 'carol@e2e.test', token: 't-carol', status: 'confirmed' as const },
    { email: 'dave@e2e.test', token: 't-dave', status: 'confirmed' as const },
    { email: 'eve@e2e.test', token: 't-eve', status: 'confirmed' as const },
  ]
  await db.insert(schema.newsletterSubscribers).values(
    subscribers.map((s) => ({
      siteId: 'kokomo',
      email: s.email,
      token: s.token,
      status: s.status,
      confirmedAt: new Date().toISOString(),
    })),
  )

  // Content items so the studio has posts to drag in
  await db.insert(schema.contentItems).values([
    {
      siteId: 'kokomo', slug: 'erstes-haus', title: 'Unser erstes Tiny House',
      summary: 'Ein Erfahrungsbericht.', date: '2026-04-01', published: 1,
    },
    {
      siteId: 'kokomo', slug: 'kosten', title: 'Was kostet ein Tiny House?',
      summary: 'Volle Transparenz.', date: '2026-04-15', published: 1,
    },
    {
      siteId: 'kokomo', slug: 'autark', title: 'Autark wohnen',
      summary: 'Solar, Wasser, Strom.', date: '2026-04-20', published: 1,
    },
  ])

  console.log('[e2e-setup] Done.')
  client.close()
}

main().catch((err) => {
  console.error('[e2e-setup] FAILED:', err)
  process.exit(1)
})
