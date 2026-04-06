import { processGraphRuns } from '@/lib/graph-processor'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const results = await processGraphRuns()
    return Response.json({
      processed: results.length,
      results,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/automation-processor] Error:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
