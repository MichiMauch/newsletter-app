// Verifies the live DB schema matches the latest Drizzle snapshot.
//
// Drizzle's migrator can silently report "complete" when the
// __drizzle_migrations journal already lists a tag, even if the SQL was
// never applied (e.g. the SQL file was edited after the journal entry was
// written). This walks the latest snapshot in drizzle/meta/ and asserts
// every table + column actually exists in the live DB.
//
// Plain .mjs (no devDeps) so it can run from `npm start` on Coolify.

import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {import('@libsql/client').Client} client
 * @param {string} migrationsFolder absolute path to drizzle/ folder
 * @returns {Promise<{ ok: true } | { ok: false; missing: string[]; snapshotTag: string }>}
 */
export async function verifySchemaAgainstLatestSnapshot(client, migrationsFolder) {
  const metaDir = path.join(migrationsFolder, 'meta')
  const journalPath = path.join(metaDir, '_journal.json')
  const journalRaw = fs.readFileSync(journalPath, 'utf8')
  const journal = JSON.parse(journalRaw)
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(`[verify-schema] no entries in ${journalPath}`)
  }

  // Latest by idx (not array order — array is usually sorted but we don't assume)
  const latest = journal.entries.reduce((a, b) => (a.idx >= b.idx ? a : b))
  const idxPadded = String(latest.idx).padStart(4, '0')
  const snapshotPath = path.join(metaDir, `${idxPadded}_snapshot.json`)
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))

  const expected = snapshot.tables ?? {}
  /** @type {string[]} */
  const missing = []

  for (const [tableName, tableDef] of Object.entries(expected)) {
    const info = await client.execute({
      sql: `PRAGMA table_info(${quoteIdent(tableName)})`,
      args: [],
    })
    if (info.rows.length === 0) {
      missing.push(`table ${tableName}`)
      continue
    }
    const live = new Set(info.rows.map((r) => String(r.name)))
    for (const colName of Object.keys(tableDef.columns ?? {})) {
      if (!live.has(colName)) missing.push(`${tableName}.${colName}`)
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing, snapshotTag: latest.tag }
  }
  return { ok: true }
}

function quoteIdent(name) {
  // SQLite identifier quoting — escape any embedded double quote.
  return `"${name.replace(/"/g, '""')}"`
}
