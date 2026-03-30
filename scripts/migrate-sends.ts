/**
 * Phase 2, Step 3: Migrate send history, recipients, automations from kokomo2026 to newsletter-app
 * Usage: npx tsx scripts/migrate-sends.ts
 *
 * Requires:
 *   SOURCE_TURSO_DB_URL / SOURCE_TURSO_DB_TOKEN  — kokomo2026 DB
 *   TURSO_DB_URL / TURSO_DB_TOKEN                — newsletter-app DB
 */

import { config } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import {
  newsletterSends,
  newsletterRecipients,
  newsletterLinkClicks,
  emailAutomations,
  emailAutomationSteps,
  emailAutomationEnrollments,
  emailAutomationSends,
} from '../lib/schema'

config({ path: '.env.local' })

async function main() {
  const source = createClient({
    url: process.env.SOURCE_TURSO_DB_URL!,
    authToken: process.env.SOURCE_TURSO_DB_TOKEN!,
  })
  const targetClient = createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_DB_TOKEN!,
  })
  const target = drizzle(targetClient)

  // ── Newsletter Sends ──
  console.log('Migrating newsletter_sends...')
  const sends = await source.execute('SELECT * FROM newsletter_sends ORDER BY id ASC')
  const sendIdMap = new Map<number, number>() // old id → new id

  for (const row of sends.rows) {
    const result = await target.insert(newsletterSends).values({
      siteId: 'kokomo',
      postSlug: row.post_slug as string,
      postTitle: row.post_title as string,
      subject: row.subject as string,
      blocksJson: (row.blocks_json as string) || null,
      sentAt: row.sent_at as string,
      recipientCount: row.recipient_count as number,
      status: row.status as string,
      deliveredCount: (row.delivered_count as number) || 0,
      openedCount: (row.opened_count as number) || 0,
      clickedCount: (row.clicked_count as number) || 0,
      bouncedCount: (row.bounced_count as number) || 0,
      complainedCount: (row.complained_count as number) || 0,
    }).returning({ id: newsletterSends.id })
    sendIdMap.set(row.id as number, result[0].id)
  }
  console.log(`  ${sends.rows.length} sends migrated.`)

  // ── Newsletter Recipients ──
  console.log('Migrating newsletter_recipients...')
  const recipients = await source.execute('SELECT * FROM newsletter_recipients ORDER BY id ASC')
  const recipientIdMap = new Map<number, number>()

  for (const row of recipients.rows) {
    const newSendId = sendIdMap.get(row.send_id as number)
    if (!newSendId) continue
    const result = await target.insert(newsletterRecipients).values({
      sendId: newSendId,
      email: row.email as string,
      resendEmailId: (row.resend_email_id as string) || null,
      status: row.status as 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained',
      deliveredAt: row.delivered_at as string | null,
      openedAt: row.opened_at as string | null,
      openCount: (row.open_count as number) || 0,
      clickedAt: row.clicked_at as string | null,
      clickCount: (row.click_count as number) || 0,
      bouncedAt: row.bounced_at as string | null,
      bounceType: row.bounce_type as string | null,
      complainedAt: row.complained_at as string | null,
      createdAt: row.created_at as string,
    }).returning({ id: newsletterRecipients.id })
    recipientIdMap.set(row.id as number, result[0].id)
  }
  console.log(`  ${recipients.rows.length} recipients migrated.`)

  // ── Newsletter Link Clicks ──
  console.log('Migrating newsletter_link_clicks...')
  const clicks = await source.execute('SELECT * FROM newsletter_link_clicks ORDER BY id ASC')
  for (const row of clicks.rows) {
    const newSendId = sendIdMap.get(row.send_id as number)
    const newRecipientId = row.recipient_id ? recipientIdMap.get(row.recipient_id as number) : null
    if (!newSendId) continue
    await target.insert(newsletterLinkClicks).values({
      sendId: newSendId,
      recipientId: newRecipientId ?? null,
      url: row.url as string,
      clickedAt: row.clicked_at as string,
    })
  }
  console.log(`  ${clicks.rows.length} link clicks migrated.`)

  // ── Email Automations ──
  console.log('Migrating email_automations...')
  const automations = await source.execute('SELECT * FROM email_automations ORDER BY id ASC')
  const automationIdMap = new Map<number, number>()

  for (const row of automations.rows) {
    const result = await target.insert(emailAutomations).values({
      siteId: 'kokomo',
      name: row.name as string,
      triggerType: row.trigger_type as string,
      active: row.active as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }).returning({ id: emailAutomations.id })
    automationIdMap.set(row.id as number, result[0].id)
  }
  console.log(`  ${automations.rows.length} automations migrated.`)

  // ── Automation Steps ──
  console.log('Migrating email_automation_steps...')
  const steps = await source.execute('SELECT * FROM email_automation_steps ORDER BY id ASC')
  const stepIdMap = new Map<number, number>()

  for (const row of steps.rows) {
    const newAutomationId = automationIdMap.get(row.automation_id as number)
    if (!newAutomationId) continue
    const result = await target.insert(emailAutomationSteps).values({
      automationId: newAutomationId,
      stepOrder: row.step_order as number,
      delayHours: row.delay_hours as number,
      subject: row.subject as string,
      blocksJson: row.blocks_json as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }).returning({ id: emailAutomationSteps.id })
    stepIdMap.set(row.id as number, result[0].id)
  }
  console.log(`  ${steps.rows.length} steps migrated.`)

  // ── Automation Enrollments ──
  console.log('Migrating email_automation_enrollments...')
  const enrollments = await source.execute('SELECT * FROM email_automation_enrollments ORDER BY id ASC')
  const enrollmentIdMap = new Map<number, number>()

  for (const row of enrollments.rows) {
    const newAutomationId = automationIdMap.get(row.automation_id as number)
    if (!newAutomationId) continue
    try {
      const result = await target.insert(emailAutomationEnrollments).values({
        automationId: newAutomationId,
        subscriberEmail: row.subscriber_email as string,
        status: row.status as 'active' | 'completed' | 'cancelled',
        enrolledAt: row.enrolled_at as string,
        completedAt: row.completed_at as string | null,
        cancelledAt: row.cancelled_at as string | null,
      }).returning({ id: emailAutomationEnrollments.id })
      enrollmentIdMap.set(row.id as number, result[0].id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('UNIQUE')) continue
      throw err
    }
  }
  console.log(`  ${enrollments.rows.length} enrollments migrated.`)

  // ── Automation Sends ──
  console.log('Migrating email_automation_sends...')
  const autoSends = await source.execute('SELECT * FROM email_automation_sends ORDER BY id ASC')
  for (const row of autoSends.rows) {
    const newEnrollmentId = enrollmentIdMap.get(row.enrollment_id as number)
    const newStepId = stepIdMap.get(row.step_id as number)
    if (!newEnrollmentId || !newStepId) continue
    await target.insert(emailAutomationSends).values({
      enrollmentId: newEnrollmentId,
      stepId: newStepId,
      resendEmailId: row.resend_email_id as string | null,
      status: row.status as string,
      sentAt: row.sent_at as string,
      deliveredAt: row.delivered_at as string | null,
      openedAt: row.opened_at as string | null,
      openCount: (row.open_count as number) || 0,
      clickedAt: row.clicked_at as string | null,
      clickCount: (row.click_count as number) || 0,
      bouncedAt: row.bounced_at as string | null,
      bounceType: row.bounce_type as string | null,
      complainedAt: row.complained_at as string | null,
    })
  }
  console.log(`  ${autoSends.rows.length} automation sends migrated.`)

  console.log('\nAll data migration complete!')
}

main().catch(console.error)
