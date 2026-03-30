import { upsertContentItems } from '@/lib/content'

export async function POST(request: Request) {
  const headers = { 'Content-Type': 'application/json' }

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  try {
    const { siteId, items } = await request.json()

    if (!siteId || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'siteId and items[] are required.' }), { status: 400, headers })
    }

    const count = await upsertContentItems(siteId, items)
    return new Response(JSON.stringify({ ok: true, synced: count }), { status: 200, headers })
  } catch (err) {
    console.error('[content-sync POST]', err)
    return new Response(JSON.stringify({ error: 'Content sync failed.' }), { status: 500, headers })
  }
}
