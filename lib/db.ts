import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

let _db: ReturnType<typeof createDrizzle> | null = null

function createDrizzle() {
  const client = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })
  return drizzle(client, { schema })
}

export function getDb() {
  if (!_db) _db = createDrizzle()
  return _db
}

export type Db = ReturnType<typeof getDb>
