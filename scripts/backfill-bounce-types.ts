/**
 * Holt Typ und Subtyp bestehender Bounces aus der Resend-API nach.
 *
 * Hintergrund: der Webhook las `data.bounce.bounce_type` / `.sub_type` — Felder,
 * die Resend gar nicht schickt (es sind `type` / `subType`). Deshalb stehen
 * Alt-Bounces mit bounce_type = NULL in der DB, und kein Permanent-Bounce wurde
 * je automatisch gesperrt.
 *
 * GET /emails/:id liefert das vollständige bounce-Objekt nach. Sehr alte Mails
 * sind bei Resend nicht mehr abrufbar (404) — die bleiben ohne Typ, was für die
 * Soft-Bounce-Schwelle korrekt ist (NULL zählt dort als nicht-permanent).
 *
 *   npx tsx scripts/backfill-bounce-types.ts            # nur anzeigen
 *   npx tsx scripts/backfill-bounce-types.ts --apply    # schreiben
 */

import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { bounceMetadata, type ResendBounce } from '../lib/newsletter-bounces'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const API_KEY = process.env.RESEND_API_KEY

async function fetchBounce(resendEmailId: string): Promise<ResendBounce | null | 'gone'> {
  const res = await fetch(`https://api.resend.com/emails/${resendEmailId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (res.status === 404) return 'gone'
  if (!res.ok) throw new Error(`Resend ${res.status} für ${resendEmailId}`)
  const body = await res.json() as { bounce?: ResendBounce }
  return body.bounce ?? null
}

async function main() {
  if (!API_KEY) throw new Error('RESEND_API_KEY fehlt')
  const db = getDb()

  // Beide Tabellen mit Bounce-Spalten: Newsletter-Versände und Automation-Mails.
  // email_automation_sends hat keine email-Spalte (die hängt am Enrollment) —
  // für die Ausgabe genügt dort die Resend-ID.
  const targets = [
    { table: 'newsletter_recipients', label: 'Newsletter', labelColumn: 'email' },
    { table: 'email_automation_sends', label: 'Automation', labelColumn: 'resend_email_id' },
  ] as const

  for (const { table, label, labelColumn } of targets) {
    const rows = await db.run(sql.raw(`
      SELECT id, ${labelColumn} AS label, resend_email_id
      FROM ${table}
      WHERE status = 'bounced' AND bounce_type IS NULL AND resend_email_id IS NOT NULL
    `))
    if (rows.rows.length === 0) {
      console.log(`${label}: keine Bounces ohne Typ.`)
      continue
    }
    console.log(`\n${label}: ${rows.rows.length} Bounce(s) ohne Typ`)

    for (const row of rows.rows) {
      const id = row.id as number
      const rowLabel = row.label as string
      const resendId = row.resend_email_id as string

      const bounce = await fetchBounce(resendId)
      if (bounce === 'gone') {
        console.log(`  ${rowLabel}: bei Resend nicht mehr abrufbar — bleibt ohne Typ`)
        continue
      }
      const meta = bounceMetadata(bounce ?? undefined)
      if (!meta?.bounce_type) {
        console.log(`  ${rowLabel}: Resend liefert keinen Typ`)
        continue
      }
      console.log(`  ${rowLabel}: ${meta.bounce_type} · ${meta.bounce_sub_type ?? '—'}`)
      if (!APPLY) continue

      await db.run(sql`
        UPDATE ${sql.raw(table)}
        SET bounce_type = ${meta.bounce_type},
            bounce_sub_type = ${meta.bounce_sub_type ?? null},
            bounce_message = COALESCE(${meta.bounce_message ?? null}, bounce_message)
        WHERE id = ${id}
      `)
    }
  }

  if (!APPLY) console.log('\nProbelauf — nichts geschrieben. Mit --apply ausführen.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
