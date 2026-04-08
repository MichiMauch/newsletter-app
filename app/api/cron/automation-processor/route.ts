import { processGraphRuns } from '@/lib/graph-processor'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return new Response('CRON_SECRET not configured', { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const results = await processGraphRuns()
    return Response.json({
      processed: results.length,
      results,
    })
  } catch (err: unknown) {
    console.error('[cron/automation-processor] Error:', err)
    return Response.json({ error: 'Automation processing failed.' }, { status: 500 })
  }
}
