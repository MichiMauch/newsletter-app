import { sql } from 'drizzle-orm'
import { getDb } from './db'

export interface BounceBreakdownRow {
  bounce_type: string | null
  bounce_sub_type: string | null
  count: number
  unique_emails: number
}

export interface BouncedAddressRow {
  email: string
  bounce_count: number
  last_bounced_at: string
  last_bounce_type: string | null
  last_bounce_sub_type: string | null
  last_bounce_message: string | null
  last_source: 'newsletter' | 'automation'
  newsletter_bounces: number
  automation_bounces: number
  subscriber_status: 'pending' | 'confirmed' | 'unsubscribed' | null
}

export interface BounceOverview {
  total_bounces: number
  unique_addresses: number
  newsletter_bounces: number
  automation_bounces: number
  by_subtype: BounceBreakdownRow[]
  addresses: BouncedAddressRow[]
}

// Inline-CTE: vereint Bounces aus newsletter_recipients und email_automation_sends.
// Wird mehrfach referenziert, damit die Subqueries nicht jede Quelle einzeln joinen müssen.
const allBouncesCte = (siteId: string) => sql`
  WITH all_bounces AS (
    SELECT
      'newsletter' AS source,
      nr.email AS email,
      nr.bounce_type AS bounce_type,
      nr.bounce_sub_type AS bounce_sub_type,
      nr.bounce_message AS bounce_message,
      nr.bounced_at AS bounced_at
    FROM newsletter_recipients nr
    JOIN newsletter_sends ns ON ns.id = nr.send_id
    WHERE ns.site_id = ${siteId} AND nr.status = 'bounced'
    UNION ALL
    SELECT
      'automation' AS source,
      eae.subscriber_email AS email,
      eas.bounce_type AS bounce_type,
      eas.bounce_sub_type AS bounce_sub_type,
      eas.bounce_message AS bounce_message,
      eas.bounced_at AS bounced_at
    FROM email_automation_sends eas
    JOIN email_automation_enrollments eae ON eae.id = eas.enrollment_id
    JOIN email_automations ea ON ea.id = eae.automation_id
    WHERE ea.site_id = ${siteId} AND eas.status = 'bounced'
  )
`

export async function getBounceOverview(siteId: string, limit = 200): Promise<BounceOverview> {
  const db = getDb()

  // Drei unabhängige Aggregate auf demselben CTE — parallel ausführen.
  const [breakdownRes, addrRes, totalsRes] = await Promise.all([
    // Aggregat nach (bounce_type, bounce_sub_type)
    db.run(sql`
      ${allBouncesCte(siteId)}
      SELECT bounce_type, bounce_sub_type,
        COUNT(*) AS count,
        COUNT(DISTINCT email) AS unique_emails
      FROM all_bounces
      GROUP BY bounce_type, bounce_sub_type
      ORDER BY count DESC
    `),
    // Adressliste: letzter Bounce + Counts pro Quelle
    db.run(sql`
      ${allBouncesCte(siteId)},
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY email ORDER BY bounced_at DESC) AS rn
        FROM all_bounces
      ),
      counts AS (
        SELECT email,
          COUNT(*) AS bounce_count,
          MAX(bounced_at) AS last_bounced_at,
          SUM(CASE WHEN source = 'newsletter' THEN 1 ELSE 0 END) AS newsletter_bounces,
          SUM(CASE WHEN source = 'automation' THEN 1 ELSE 0 END) AS automation_bounces
        FROM all_bounces
        GROUP BY email
      )
      SELECT c.email,
        c.bounce_count,
        c.last_bounced_at,
        c.newsletter_bounces,
        c.automation_bounces,
        r.bounce_type AS last_bounce_type,
        r.bounce_sub_type AS last_bounce_sub_type,
        r.bounce_message AS last_bounce_message,
        r.source AS last_source,
        (SELECT s.status FROM newsletter_subscribers s
          WHERE s.site_id = ${siteId} AND s.email = c.email LIMIT 1) AS subscriber_status
      FROM counts c
      JOIN ranked r ON r.email = c.email AND r.rn = 1
      ORDER BY c.last_bounced_at DESC
      LIMIT ${limit}
    `),
    db.run(sql`
      ${allBouncesCte(siteId)}
      SELECT
        COUNT(DISTINCT email) AS unique_emails,
        SUM(CASE WHEN source = 'newsletter' THEN 1 ELSE 0 END) AS newsletter_bounces,
        SUM(CASE WHEN source = 'automation' THEN 1 ELSE 0 END) AS automation_bounces
      FROM all_bounces
    `),
  ])

  const by_subtype: BounceBreakdownRow[] = (breakdownRes.rows ?? []).map((r) => ({
    bounce_type: (r.bounce_type as string | null) ?? null,
    bounce_sub_type: (r.bounce_sub_type as string | null) ?? null,
    count: (r.count as number) || 0,
    unique_emails: (r.unique_emails as number) || 0,
  }))

  const addresses: BouncedAddressRow[] = (addrRes.rows ?? []).map((r) => ({
    email: r.email as string,
    bounce_count: (r.bounce_count as number) || 0,
    last_bounced_at: r.last_bounced_at as string,
    last_bounce_type: (r.last_bounce_type as string | null) ?? null,
    last_bounce_sub_type: (r.last_bounce_sub_type as string | null) ?? null,
    last_bounce_message: (r.last_bounce_message as string | null) ?? null,
    last_source: ((r.last_source as string) === 'automation' ? 'automation' : 'newsletter') as 'newsletter' | 'automation',
    newsletter_bounces: (r.newsletter_bounces as number) || 0,
    automation_bounces: (r.automation_bounces as number) || 0,
    subscriber_status: (r.subscriber_status as 'pending' | 'confirmed' | 'unsubscribed' | null) ?? null,
  }))
  const totalsRow = totalsRes.rows?.[0] ?? {}
  const total_bounces = by_subtype.reduce((sum, b) => sum + b.count, 0)
  const unique_addresses = (totalsRow.unique_emails as number) || 0
  const newsletter_bounces = (totalsRow.newsletter_bounces as number) || 0
  const automation_bounces = (totalsRow.automation_bounces as number) || 0

  return { total_bounces, unique_addresses, newsletter_bounces, automation_bounces, by_subtype, addresses }
}
