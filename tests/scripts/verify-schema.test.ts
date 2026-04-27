import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { verifySchemaAgainstLatestSnapshot } from '../../scripts/verify-schema.mjs'

// Builds a tiny drizzle-style migrations folder with a single snapshot, so we
// can assert the verifier's success and failure paths without touching a real
// migration history. The snapshot shape mirrors what drizzle-kit writes.
function makeMigrationsFolder(snapshotTables: Record<string, { columns: Record<string, unknown> }>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-schema-'))
  const meta = path.join(dir, 'meta')
  fs.mkdirSync(meta)
  fs.writeFileSync(
    path.join(meta, '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: [{ idx: 0, version: '6', when: 1, tag: 'test_only', breakpoints: true }],
    }),
  )
  fs.writeFileSync(
    path.join(meta, '0000_snapshot.json'),
    JSON.stringify({ version: '6', dialect: 'sqlite', tables: snapshotTables }),
  )
  return dir
}

describe('verifySchemaAgainstLatestSnapshot', () => {
  const client = createClient({ url: ':memory:' })

  beforeAll(async () => {
    await client.execute(`CREATE TABLE foo (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`)
    await client.execute(`CREATE TABLE bar (id INTEGER PRIMARY KEY)`)
  })

  afterAll(() => {
    client.close()
  })

  it('returns ok when every snapshot table+column exists in the live DB', async () => {
    const dir = makeMigrationsFolder({
      foo: { columns: { id: {}, name: {} } },
      bar: { columns: { id: {} } },
    })
    const result = await verifySchemaAgainstLatestSnapshot(client, dir)
    expect(result).toEqual({ ok: true })
  })

  it('flags a missing column on an existing table', async () => {
    const dir = makeMigrationsFolder({
      foo: { columns: { id: {}, name: {}, missing_col: {} } },
    })
    const result = await verifySchemaAgainstLatestSnapshot(client, dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual(['foo.missing_col'])
    expect(result.snapshotTag).toBe('test_only')
  })

  it('flags a missing table outright (does not enumerate its columns)', async () => {
    const dir = makeMigrationsFolder({
      ghost: { columns: { id: {}, anything: {} } },
    })
    const result = await verifySchemaAgainstLatestSnapshot(client, dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual(['table ghost'])
  })
})
