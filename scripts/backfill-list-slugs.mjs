// One-shot backfill fuer den "kein Hauptlisten-Konzept"-Refactor:
// Setzt subscriber_lists.slug fuer alle bestehenden Listen aus dem Namen.
// Sicherstellt eindeutige Slugs pro Site (Suffix -2, -3, ... falls noetig).
//
// Dry-run by default. --apply schreibt.
//   node --env-file=.env.local scripts/backfill-list-slugs.mjs
//   node --env-file=.env.local scripts/backfill-list-slugs.mjs --apply

import { createClient } from '@libsql/client'

const apply = process.argv.includes('--apply')

const url = process.env.TURSO_DB_URL
const authToken = process.env.TURSO_DB_TOKEN
if (!url) {
  console.error('TURSO_DB_URL missing')
  process.exit(1)
}

const client = createClient({ url, authToken })

console.log(apply ? '── APPLY MODE ──' : '── DRY RUN (pass --apply to write) ──')

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'list'
}

const lists = await client.execute(`
  SELECT id, site_id, name, slug FROM subscriber_lists ORDER BY site_id, id
`)

console.log(`\n[step 1] Listen ohne Slug: ${lists.rows.filter(r => !r.slug).length}`)
console.log('Vorschlaege (Slugs werden pro Site eindeutig gemacht):')

// Group by site_id
const bySite = new Map()
for (const row of lists.rows) {
  const list = bySite.get(row.site_id) ?? []
  list.push(row)
  bySite.set(row.site_id, list)
}

const updates = []
for (const [siteId, group] of bySite) {
  const taken = new Set(group.filter(r => r.slug).map(r => r.slug))
  for (const row of group) {
    if (row.slug) continue
    const base = slugify(row.name)
    let candidate = base
    let n = 2
    while (taken.has(candidate)) {
      candidate = `${base}-${n}`
      n++
    }
    taken.add(candidate)
    updates.push({ id: row.id, siteId, name: row.name, slug: candidate })
    console.log(`  · [site ${siteId}] id=${row.id} "${row.name}" → slug="${candidate}"`)
  }
}

if (apply && updates.length > 0) {
  for (const u of updates) {
    await client.execute({
      sql: 'UPDATE subscriber_lists SET slug = ? WHERE id = ?',
      args: [u.slug, u.id],
    })
  }
  console.log(`  ✓ ${updates.length} Listen aktualisiert`)
}

const remaining = await client.execute(
  `SELECT COUNT(*) AS n FROM subscriber_lists WHERE slug IS NULL`,
)
console.log(`\n── Listen mit NULL slug nach Lauf: ${remaining.rows[0].n}`)

client.close()
