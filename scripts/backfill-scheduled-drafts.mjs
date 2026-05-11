// One-shot backfill: drafts that were scheduled before the introduction of the
// `scheduled` draft status got marked as `sent` immediately. Promote them back
// to `scheduled` so they reappear in the lists and can still be edited.
//
// Run once with `node --env-file=.env.local scripts/backfill-scheduled-drafts.mjs`.

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DB_URL
const authToken = process.env.TURSO_DB_TOKEN
if (!url) {
  console.error('TURSO_DB_URL missing')
  process.exit(1)
}

const client = createClient({ url, authToken })

const before = await client.execute(`
  SELECT d.id, substr(d.subject, 1, 40) AS subject, s.status AS send_status, s.scheduled_for
  FROM newsletter_drafts d
  JOIN newsletter_sends s ON d.sent_send_id = s.id
  WHERE d.status = 'sent'
    AND s.status = 'scheduled'
    AND s.scheduled_for IS NOT NULL
    AND datetime(s.scheduled_for) > datetime('now')
`)

console.log(`Found ${before.rows.length} draft(s) to promote back to 'scheduled':`)
for (const row of before.rows) {
  console.log(`  - ${row.id} · "${row.subject}" → scheduled_for ${row.scheduled_for}`)
}

if (before.rows.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

const result = await client.execute(`
  UPDATE newsletter_drafts
  SET status = 'scheduled',
      sent_at = NULL,
      updated_at = datetime('now')
  WHERE status = 'sent'
    AND sent_send_id IN (
      SELECT id FROM newsletter_sends
      WHERE status = 'scheduled'
        AND scheduled_for IS NOT NULL
        AND datetime(scheduled_for) > datetime('now')
    )
`)

console.log(`Updated ${result.rowsAffected} draft(s).`)
