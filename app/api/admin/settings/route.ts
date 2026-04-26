import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { adminSettings } from '@/lib/schema'
import { eq } from 'drizzle-orm'

const ALLOWED_KEYS = new Set(['subject_prompt', 'intro_prompt'])

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key || !ALLOWED_KEYS.has(key)) {
    return Response.json({ error: 'Unbekannter Settings-Key.' }, { status: 400 })
  }

  const db = getDb()
  const row = await db.select().from(adminSettings).where(eq(adminSettings.key, key)).get()
  return Response.json({ key, value: row?.value ?? '' })
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { key?: string; value?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 })
  }

  const key = body.key
  const value = typeof body.value === 'string' ? body.value : ''
  if (!key || !ALLOWED_KEYS.has(key)) {
    return Response.json({ error: 'Unbekannter Settings-Key.' }, { status: 400 })
  }
  if (value.length > 8000) {
    return Response.json({ error: 'Wert zu lang (max 8000 Zeichen).' }, { status: 400 })
  }

  const db = getDb()
  await db
    .insert(adminSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: adminSettings.key,
      set: { value, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) },
    })

  return Response.json({ ok: true })
}
