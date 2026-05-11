// One-shot backfill for the subscription-center refactor:
//   1. Set subscriber_list_members.subscriber_id by matching (site_id, email)
//      against newsletter_subscribers.
//   2. Per site, create a "Hauptnewsletter" list (is_primary = 1) and enroll
//      every active subscriber as a member with a fresh per-membership token.
//
// Dry-run by default. Pass --apply to write.
//   node --env-file=.env.local scripts/backfill-list-members-fk.mjs           # report
//   node --env-file=.env.local scripts/backfill-list-members-fk.mjs --apply   # apply
//
// Idempotent: re-running picks up only what's still missing.
// Orphan members (no matching subscriber on the site) are reported and, with
// --apply, deleted — the user has confirmed those rows are old test data.

import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'

const apply = process.argv.includes('--apply')

const url = process.env.TURSO_DB_URL
const authToken = process.env.TURSO_DB_TOKEN
if (!url) {
  console.error('TURSO_DB_URL missing')
  process.exit(1)
}

const client = createClient({ url, authToken })

console.log(apply ? '── APPLY MODE ──' : '── DRY RUN (pass --apply to write) ──')

// ── Step 1: backfill subscriber_id on existing members ────────────────────

const matchable = await client.execute(`
  SELECT slm.id AS member_id, ns.id AS subscriber_id, sl.site_id, slm.email
  FROM subscriber_list_members slm
  JOIN subscriber_lists sl ON sl.id = slm.list_id
  JOIN newsletter_subscribers ns
    ON ns.email = slm.email AND ns.site_id = sl.site_id
  WHERE slm.subscriber_id IS NULL
`)
console.log(`\n[step 1] members to link: ${matchable.rows.length}`)
for (const r of matchable.rows) {
  console.log(`  · member ${r.member_id} → subscriber ${r.subscriber_id} (${r.email}, ${r.site_id})`)
}
if (apply) {
  for (const r of matchable.rows) {
    await client.execute({
      sql: 'UPDATE subscriber_list_members SET subscriber_id = ? WHERE id = ?',
      args: [r.subscriber_id, r.member_id],
    })
  }
  console.log(`  ✓ linked ${matchable.rows.length} members`)
}

const orphans = await client.execute(`
  SELECT slm.id, slm.list_id, slm.email, sl.site_id
  FROM subscriber_list_members slm
  JOIN subscriber_lists sl ON sl.id = slm.list_id
  LEFT JOIN newsletter_subscribers ns
    ON ns.email = slm.email AND ns.site_id = sl.site_id
  WHERE slm.subscriber_id IS NULL
    AND ns.id IS NULL
`)
console.log(`\n[step 1b] orphan members (no matching subscriber): ${orphans.rows.length}`)
for (const r of orphans.rows) {
  console.log(`  · member ${r.id} list=${r.list_id} site=${r.site_id} email=${r.email}`)
}
if (apply && orphans.rows.length > 0) {
  for (const r of orphans.rows) {
    await client.execute({
      sql: 'DELETE FROM subscriber_list_members WHERE id = ?',
      args: [r.id],
    })
  }
  console.log(`  ✓ deleted ${orphans.rows.length} orphan members`)
}

// ── Step 2: create Hauptnewsletter per site + enroll active subscribers ──
//
// "active" semantics: status='confirmed' (current naming, before phase B).
// Phase B remaps confirmed → active so the result still holds.

const sites = await client.execute(`
  SELECT DISTINCT site_id FROM newsletter_subscribers ORDER BY site_id
`)
console.log(`\n[step 2] sites: ${sites.rows.map((r) => r.site_id).join(', ') || '(none)'}`)

for (const siteRow of sites.rows) {
  const siteId = siteRow.site_id
  const existing = await client.execute({
    sql: `SELECT id FROM subscriber_lists WHERE site_id = ? AND is_primary = 1 LIMIT 1`,
    args: [siteId],
  })

  let primaryId
  if (existing.rows.length > 0) {
    primaryId = Number(existing.rows[0].id)
    console.log(`  · site ${siteId}: existing primary list id=${primaryId}`)
  } else {
    if (apply) {
      const ins = await client.execute({
        sql: `INSERT INTO subscriber_lists (site_id, name, description, is_primary)
              VALUES (?, ?, ?, 1)`,
        args: [siteId, 'Hauptnewsletter', 'Standard-Empfaengerliste fuer den regulaeren Newsletter.'],
      })
      primaryId = Number(ins.lastInsertRowid)
      console.log(`  ✓ site ${siteId}: created primary list id=${primaryId}`)
    } else {
      console.log(`  · site ${siteId}: would create primary list "Hauptnewsletter"`)
      continue
    }
  }

  // Enroll every confirmed subscriber that is not yet a member of the primary list.
  // Match by subscriber_id (post-step-1 truth) — fall back to email for any
  // legacy row that might still lack subscriber_id (shouldn't happen here).
  const toEnroll = await client.execute({
    sql: `
      SELECT ns.id AS subscriber_id, ns.email
      FROM newsletter_subscribers ns
      WHERE ns.site_id = ?
        AND ns.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1 FROM subscriber_list_members m
          WHERE m.list_id = ?
            AND (m.subscriber_id = ns.id OR m.email = ns.email)
        )
    `,
    args: [siteId, primaryId],
  })
  console.log(`    members to enroll: ${toEnroll.rows.length}`)
  if (apply) {
    for (const r of toEnroll.rows) {
      await client.execute({
        sql: `INSERT INTO subscriber_list_members (list_id, subscriber_id, email, token)
              VALUES (?, ?, ?, ?)`,
        args: [primaryId, r.subscriber_id, r.email, randomUUID()],
      })
    }
    console.log(`    ✓ enrolled ${toEnroll.rows.length} subscribers`)
  }
}

// ── Final report ─────────────────────────────────────────────────────────

const remaining = await client.execute(`
  SELECT COUNT(*) AS n FROM subscriber_list_members WHERE subscriber_id IS NULL
`)
console.log(`\n── Remaining members with NULL subscriber_id: ${remaining.rows[0].n}`)

client.close()
