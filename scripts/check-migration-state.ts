/**
 * Read-only check: does the production DB already have the expected
 * preheader column + A/B variants table? Reports without modifying.
 *
 * Usage: npx tsx scripts/check-migration-state.ts
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'

config({ path: '.env.local' })

async function main() {
  const url = process.env.TURSO_DB_URL
  if (!url) throw new Error('TURSO_DB_URL not set')
  console.log(`[check] Connecting to ${url}…`)

  const client = createClient({
    url,
    authToken: process.env.TURSO_DB_TOKEN || undefined,
  })

  const checks: { name: string; ok: boolean; detail: string }[] = []

  // 1. preheader column on newsletter_sends (migration 0012)
  try {
    const cols = await client.execute(`PRAGMA table_info('newsletter_sends')`)
    const hasPreheader = cols.rows.some((r) => r.name === 'preheader')
    checks.push({
      name: 'newsletter_sends.preheader',
      ok: hasPreheader,
      detail: hasPreheader ? 'column present' : 'column MISSING',
    })
  } catch (err) {
    checks.push({ name: 'newsletter_sends.preheader', ok: false, detail: String(err) })
  }

  // 2. newsletter_send_variants table (migration 0013)
  try {
    const tables = await client.execute(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='newsletter_send_variants'
    `)
    const hasTable = tables.rows.length > 0
    checks.push({
      name: 'table newsletter_send_variants',
      ok: hasTable,
      detail: hasTable ? 'table present' : 'table MISSING',
    })
  } catch (err) {
    checks.push({ name: 'table newsletter_send_variants', ok: false, detail: String(err) })
  }

  // 3. variant_label column on newsletter_recipients (migration 0013)
  try {
    const cols = await client.execute(`PRAGMA table_info('newsletter_recipients')`)
    const hasCol = cols.rows.some((r) => r.name === 'variant_label')
    checks.push({
      name: 'newsletter_recipients.variant_label',
      ok: hasCol,
      detail: hasCol ? 'column present' : 'column MISSING',
    })
  } catch (err) {
    checks.push({ name: 'newsletter_recipients.variant_label', ok: false, detail: String(err) })
  }

  // 4. variant_label column on scheduled_sends (migration 0013)
  try {
    const cols = await client.execute(`PRAGMA table_info('scheduled_sends')`)
    const hasCol = cols.rows.some((r) => r.name === 'variant_label')
    checks.push({
      name: 'scheduled_sends.variant_label',
      ok: hasCol,
      detail: hasCol ? 'column present' : 'column MISSING',
    })
  } catch (err) {
    checks.push({ name: 'scheduled_sends.variant_label', ok: false, detail: String(err) })
  }

  // 5. Drizzle migrations journal — last applied tag
  try {
    const journal = await client.execute(`
      SELECT hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 5
    `)
    console.log('\n[check] Drizzle journal (last 5 entries):')
    for (const row of journal.rows) {
      console.log(`  ${row.created_at}  ${String(row.hash).slice(0, 12)}…`)
    }
  } catch (err) {
    console.log(`[check] (Drizzle journal read failed: ${err})`)
  }

  console.log('\n[check] Schema state:')
  let allOk = true
  for (const c of checks) {
    const sigil = c.ok ? '✓' : '✗'
    console.log(`  ${sigil}  ${c.name}: ${c.detail}`)
    if (!c.ok) allOk = false
  }

  client.close()
  process.exit(allOk ? 0 : 2)
}

main().catch((err) => {
  console.error('[check] FAILED:', err)
  process.exit(1)
})
