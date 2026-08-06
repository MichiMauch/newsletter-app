/**
 * Webhook-Ereignisse zu Automations-Mails gegen eine echte SQLite-DB.
 *
 * Der Kern: eine Automations-Mail muss überhaupt erst als Send erfasst werden,
 * sonst findet der Webhook zu ihrer resend_email_id nichts und verwirft Klicks
 * und Bounces stillschweigend. Am teuersten war dabei der Hard Bounce — ohne
 * Sperre hätte die Automation eine tote Adresse endlos weiter angeschrieben.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'

process.env.TURSO_DB_URL = ':memory:'
process.env.TURSO_DB_TOKEN = ''

const { getDb } = await import('@/lib/db')
const { migrate } = await import('drizzle-orm/libsql/migrator')
const {
  recordGraphAutomationSend, updateAutomationSendEvent, hasClickedAutomationEmail,
} = await import('@/lib/automation')
const { bounceMetadata } = await import('@/lib/newsletter-bounces')

const db = getDb()
const SITE = 'kokomo'
const EMAIL = 'laeuft@example.com'
const ENROLLMENT_ID = 1
const RESEND_ID = 'resend-automation-1'
const T = '2026-08-06T08:00:00.000Z'

async function seed() {
  await db.run(sql`DELETE FROM email_automation_sends`)
  await db.run(sql`DELETE FROM email_automation_enrollments`)
  await db.run(sql`DELETE FROM email_automations`)
  await db.run(sql`DELETE FROM newsletter_subscribers`)
  await db.run(sql`
    INSERT INTO email_automations (id, site_id, name, active) VALUES (1, ${SITE}, 'Willkommen', 1)
  `)
  await db.run(sql`
    INSERT INTO email_automation_enrollments (id, automation_id, subscriber_email, status)
    VALUES (${ENROLLMENT_ID}, 1, ${EMAIL}, 'active')
  `)
  await db.run(sql`
    INSERT INTO newsletter_subscribers (site_id, email, status, token)
    VALUES (${SITE}, ${EMAIL}, 'active', 'tok-1')
  `)
}

async function send() {
  const r = await db.run(sql`SELECT * FROM email_automation_sends WHERE resend_email_id = ${RESEND_ID}`)
  return r.rows[0] as unknown as {
    status: string; click_count: number; node_id: string | null
    step_id: number | null; bounce_type: string | null
  }
}

async function subscriberStatus() {
  const r = await db.run(sql`SELECT status FROM newsletter_subscribers WHERE email = ${EMAIL}`)
  return r.rows[0]?.status
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' })
})

beforeEach(async () => {
  await seed()
  await recordGraphAutomationSend(ENROLLMENT_ID, 'node-abc', RESEND_ID)
})

describe('recordGraphAutomationSend', () => {
  it('legt die Send-Zeile mit node_id statt step_id an', async () => {
    const row = await send()
    expect(row.node_id).toBe('node-abc')
    // Graph-Nodes haben keine Zeile in email_automation_steps.
    expect(row.step_id).toBe(null)
    expect(row.status).toBe('sent')
  })
})

describe('updateAutomationSendEvent', () => {
  it('ordnet eine Zustellung zu', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'delivered', T)
    expect((await send()).status).toBe('delivered')
  })

  it('ordnet einen Klick zu', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'clicked', T)

    const row = await send()
    expect(row.status).toBe('clicked')
    expect(row.click_count).toBe(1)
  })

  it('sperrt den Subscriber bei einem Permanent-Bounce', async () => {
    // Der eigentliche Punkt: vorher lief das nur im Newsletter-Pfad, eine
    // Automation hätte die tote Adresse weiter angeschrieben.
    await updateAutomationSendEvent(RESEND_ID, 'bounced', T, bounceMetadata({
      type: 'Permanent', subType: 'NoEmail',
    }))

    expect((await send()).bounce_type).toBe('Permanent')
    expect(await subscriberStatus()).toBe('blocked')
  })

  it('sperrt bei einem Transient-Bounce nicht', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'bounced', T, bounceMetadata({ type: 'Transient' }))
    expect(await subscriberStatus()).toBe('active')
  })

  it('sperrt bei einer Beschwerde', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'complained', T)
    expect(await subscriberStatus()).toBe('blocked')
  })

  it('ignoriert Ereignisse zu einer unbekannten resend_email_id', async () => {
    await updateAutomationSendEvent('gibt-es-nicht', 'bounced', T, bounceMetadata({ type: 'Permanent' }))
    expect(await subscriberStatus()).toBe('active')
  })

  it('dreht nach einem Bounce nichts mehr zurück', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'bounced', T, bounceMetadata({ type: 'Transient' }))
    await updateAutomationSendEvent(RESEND_ID, 'delivered', T)
    expect((await send()).status).toBe('bounced')
  })
})

describe('hasClickedAutomationEmail', () => {
  it('meldet false, solange nichts geklickt wurde', async () => {
    expect(await hasClickedAutomationEmail(ENROLLMENT_ID)).toBe(false)
  })

  it('meldet true nach einem Klick', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'clicked', T)
    expect(await hasClickedAutomationEmail(ENROLLMENT_ID)).toBe(true)
  })

  it('trennt nach Enrollment', async () => {
    await updateAutomationSendEvent(RESEND_ID, 'clicked', T)
    expect(await hasClickedAutomationEmail(999)).toBe(false)
  })
})
