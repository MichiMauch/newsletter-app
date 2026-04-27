import * as Sentry from '@sentry/nextjs'
import { processGraphRuns } from '@/lib/graph-processor'
import { runInactivityTriggers, runEngagementTriggers } from '@/lib/graph-automation'
import { pushDueSendsToResend, flushDoneScheduledSends } from '@/lib/scheduled-sends'
import { recomputeAllEngagement } from '@/lib/engagement'
import { getAllSites } from '@/lib/site-config'
import { safeEqualStrings } from '@/lib/timing-safe'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return new Response('CRON_SECRET not configured', { status: 500 })
  }
  const authHeader = request.headers.get('authorization') ?? ''
  if (!safeEqualStrings(authHeader, `Bearer ${cronSecret}`)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const triggers = await runInactivityTriggers()
    const engagementTriggers = await runEngagementTriggers()
    const results = await processGraphRuns()
    const scheduled = await pushDueSendsToResend()
    const flushed = await flushDoneScheduledSends()

    // Engagement-Score nur 1x täglich (zwischen 03:00-03:59 UTC) recomputen — sonst zu teuer
    const utcHour = new Date().getUTCHours()
    let engagementUpdated = 0
    if (utcHour === 3) {
      const sites = await getAllSites()
      for (const site of sites) {
        const r = await recomputeAllEngagement(site.id)
        engagementUpdated += r.updated
      }
    }

    return Response.json({
      triggers,
      engagement_triggers: engagementTriggers,
      processed: results.length,
      results,
      scheduled,
      flushed_scheduled: flushed.flushed,
      engagement_updated: engagementUpdated,
    })
  } catch (err: unknown) {
    console.error('[cron/automation-processor] Error:', err)
    Sentry.captureException(err, { tags: { area: 'cron', job: 'automation-processor' } })
    return Response.json({ error: 'Automation processing failed.' }, { status: 500 })
  }
}
