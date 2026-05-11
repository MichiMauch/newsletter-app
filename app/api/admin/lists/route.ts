import { isAuthenticated } from '@/lib/admin-auth'
import { getDb } from '@/lib/db'
import { newsletterSubscribers } from '@/lib/schema'
import { and, eq } from 'drizzle-orm'
import {
  getLists, getList, createList, renameList, deleteList, setPrimaryList,
  addMembers, removeMember, getListMembers,
} from '@/lib/lists'
import { DEFAULT_SITE_ID as SITE_ID } from '@/lib/site-config'

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const listIdParam = url.searchParams.get('listId')

  if (listIdParam) {
    const id = parseInt(listIdParam, 10)
    if (Number.isNaN(id)) {
      return Response.json({ error: 'Ungültige listId.' }, { status: 400 })
    }
    const list = await getList(id)
    if (!list || list.site_id !== SITE_ID) {
      return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
    }
    const members = await getListMembers(id)
    return Response.json({ list, members })
  }

  const lists = await getLists(SITE_ID)
  return Response.json({ lists })
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 })
  }

  const action = body.action

  // Hilfs-Funktion: Listen-Owner-Check
  async function ensureOwn(id: number) {
    const list = await getList(id)
    if (!list || list.site_id !== SITE_ID) {
      return null
    }
    return list
  }

  switch (action) {
    case 'create': {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return Response.json({ error: 'Name ist erforderlich.' }, { status: 400 })
      const description = typeof body.description === 'string' ? body.description.trim() : undefined
      const id = await createList(SITE_ID, name, description || undefined)
      return Response.json({ ok: true, id })
    }

    case 'rename': {
      const id = parseInt(String(body.id), 10)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (Number.isNaN(id) || !name) {
        return Response.json({ error: 'id und name erforderlich.' }, { status: 400 })
      }
      if (!(await ensureOwn(id))) {
        return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
      }
      const description = typeof body.description === 'string' ? body.description.trim() : null
      await renameList(id, name, description)
      return Response.json({ ok: true })
    }

    case 'delete': {
      const id = parseInt(String(body.id), 10)
      if (Number.isNaN(id)) {
        return Response.json({ error: 'id erforderlich.' }, { status: 400 })
      }
      if (!(await ensureOwn(id))) {
        return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
      }
      await deleteList(id)
      return Response.json({ ok: true })
    }

    case 'set-primary': {
      const id = parseInt(String(body.id), 10)
      const makePrimary = body.makePrimary !== false
      if (Number.isNaN(id)) {
        return Response.json({ error: 'id erforderlich.' }, { status: 400 })
      }
      if (!(await ensureOwn(id))) {
        return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
      }
      await setPrimaryList(id, makePrimary)
      return Response.json({ ok: true })
    }

    case 'add-members': {
      const listId = parseInt(String(body.listId), 10)
      if (Number.isNaN(listId)) {
        return Response.json({ error: 'listId erforderlich.' }, { status: 400 })
      }
      if (!(await ensureOwn(listId))) {
        return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
      }
      const emails = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === 'string') : []
      if (emails.length === 0) {
        return Response.json({ error: 'emails (Array) erforderlich.' }, { status: 400 })
      }
      const result = await addMembers(listId, emails)
      return Response.json({ ok: true, ...result })
    }

    case 'remove-member': {
      const listId = parseInt(String(body.listId), 10)
      // Bevorzugt subscriberId; alternativ email (legacy UI vor dem
      // Subscription-Center-Refactor) — dann erst Subscriber lookup.
      let subscriberId = typeof body.subscriberId === 'number' ? body.subscriberId : NaN
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (Number.isNaN(listId) || (Number.isNaN(subscriberId) && !email)) {
        return Response.json({ error: 'listId und (subscriberId|email) erforderlich.' }, { status: 400 })
      }
      if (!(await ensureOwn(listId))) {
        return Response.json({ error: 'Liste nicht gefunden.' }, { status: 404 })
      }
      if (Number.isNaN(subscriberId)) {
        const db = getDb()
        const sub = await db.select({ id: newsletterSubscribers.id })
          .from(newsletterSubscribers)
          .where(and(eq(newsletterSubscribers.siteId, SITE_ID), eq(newsletterSubscribers.email, email)))
          .limit(1)
        if (!sub[0]) return Response.json({ ok: true, removed: false })
        subscriberId = sub[0].id
      }
      const removed = await removeMember(listId, subscriberId)
      return Response.json({ ok: true, removed })
    }

    default:
      return Response.json({ error: `Unbekannte action: ${String(action)}` }, { status: 400 })
  }
}
