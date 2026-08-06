/**
 * Email automation data layer — Drizzle ORM
 * Manages graph-based workflows: automations, nodes, edges, enrollments
 */

import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  emailAutomations,
  emailAutomationEnrollments,
  emailAutomationSends,
  automationNodes,
  newsletterSubscribers,
} from './schema'
import { isPermanentBounce } from './newsletter-sends'
import { blockSubscriberWithReason } from './newsletter-subscribers'

// ─── Types ─────────────────────────────────────────────────────────────

export interface Automation {
  id: number
  site_id: string
  name: string
  trigger_type: string
  trigger_config: string
  active: number
  created_at: string
  updated_at: string
  step_count?: number
  enrollment_count?: number
}

export interface AutomationEnrollment {
  id: number
  automation_id: number
  subscriber_email: string
  status: 'active' | 'completed' | 'cancelled'
  enrolled_at: string
  completed_at: string | null
  cancelled_at: string | null
  trigger_ref: string | null
}

// ─── Automation CRUD ───────────────────────────────────────────────────

export async function listAutomations(siteId: string): Promise<Automation[]> {
  const db = getDb()
  const rows = await db.select({
    id: emailAutomations.id,
    siteId: emailAutomations.siteId,
    name: emailAutomations.name,
    triggerType: emailAutomations.triggerType,
    triggerConfig: emailAutomations.triggerConfig,
    active: emailAutomations.active,
    createdAt: emailAutomations.createdAt,
    updatedAt: emailAutomations.updatedAt,
    // node_count (excluding trigger node) = step_count equivalent
    stepCount: sql<number>`(SELECT COUNT(*) FROM automation_nodes WHERE automation_id = ${emailAutomations.id} AND node_type != 'trigger')`,
    enrollmentCount: sql<number>`(SELECT COUNT(*) FROM email_automation_enrollments WHERE automation_id = ${emailAutomations.id})`,
  }).from(emailAutomations)
    .where(eq(emailAutomations.siteId, siteId))
    .orderBy(sql`${emailAutomations.createdAt} DESC`)

  return rows.map((r) => ({
    id: r.id, site_id: r.siteId, name: r.name,
    trigger_type: r.triggerType, trigger_config: r.triggerConfig,
    active: r.active, created_at: r.createdAt, updated_at: r.updatedAt,
    step_count: r.stepCount, enrollment_count: r.enrollmentCount,
  }))
}

export async function getAutomation(id: number): Promise<{ automation: Automation } | null> {
  const db = getDb()
  const aRows = await db.select().from(emailAutomations).where(eq(emailAutomations.id, id)).limit(1)
  if (aRows.length === 0) return null

  const a = aRows[0]
  // Read trigger_type from trigger node (not from legacy column)
  const triggerRows = await db.select({ config: automationNodes.configJson })
    .from(automationNodes)
    .where(and(eq(automationNodes.automationId, id), eq(automationNodes.nodeType, 'trigger')))
    .limit(1)

  let triggerType = a.triggerType
  let triggerConfig = a.triggerConfig
  if (triggerRows.length > 0) {
    try {
      const cfg = JSON.parse(triggerRows[0].config) as { trigger_type?: string } & Record<string, unknown>
      if (cfg.trigger_type) triggerType = cfg.trigger_type as typeof a.triggerType
      triggerConfig = JSON.stringify(cfg)
    } catch { /* keep legacy */ }
  }

  return {
    automation: {
      id: a.id, site_id: a.siteId, name: a.name,
      trigger_type: triggerType, trigger_config: triggerConfig,
      active: a.active, created_at: a.createdAt, updated_at: a.updatedAt,
    },
  }
}

export async function createAutomation(siteId: string, name: string, triggerType: string, triggerConfig?: string): Promise<number> {
  const db = getDb()
  const result = await db.insert(emailAutomations).values({
    siteId, name,
    triggerType: triggerType as 'subscriber_confirmed' | 'manual' | 'no_activity_days' | 'link_clicked',
    triggerConfig: triggerConfig || '{}',
  }).returning({ id: emailAutomations.id })
  return result[0].id
}

export async function updateAutomation(id: number, data: { name?: string; active?: number }): Promise<void> {
  const db = getDb()
  const set: Record<string, unknown> = { updatedAt: sql`datetime('now')` }
  if (data.name !== undefined) set.name = data.name
  if (data.active !== undefined) set.active = data.active
  await db.update(emailAutomations).set(set).where(eq(emailAutomations.id, id))
}

export async function deleteAutomation(id: number): Promise<void> {
  const db = getDb()
  await db.delete(emailAutomations).where(eq(emailAutomations.id, id))
}

// ─── Enrollment ────────────────────────────────────────────────────────

export async function enrollSubscriber(siteId: string, email: string, triggerType: string): Promise<number> {
  const { getAutomationsByTriggerType, enrollInGraph } = await import('./graph-automation')
  const automations = await getAutomationsByTriggerType(siteId, triggerType as 'subscriber_confirmed' | 'manual' | 'no_activity_days' | 'link_clicked')
  let count = 0
  for (const a of automations) {
    const id = await enrollInGraph(a.automationId, email)
    if (id) count++
  }
  return count
}

export async function cancelEnrollments(email: string): Promise<void> {
  const db = getDb()
  await db.update(emailAutomationEnrollments)
    .set({ status: 'cancelled', cancelledAt: sql`datetime('now')` })
    .where(and(eq(emailAutomationEnrollments.subscriberEmail, email), eq(emailAutomationEnrollments.status, 'active')))
}

export async function cancelEnrollmentById(enrollmentId: number): Promise<void> {
  const db = getDb()
  await db.update(emailAutomationEnrollments)
    .set({ status: 'cancelled', cancelledAt: sql`datetime('now')` })
    .where(eq(emailAutomationEnrollments.id, enrollmentId))
}

export async function getEnrollments(automationId: number): Promise<AutomationEnrollment[]> {
  const db = getDb()
  const rows = await db.select().from(emailAutomationEnrollments)
    .where(eq(emailAutomationEnrollments.automationId, automationId))
    .orderBy(sql`${emailAutomationEnrollments.enrolledAt} DESC`)
  return rows.map((r) => ({
    id: r.id, automation_id: r.automationId, subscriber_email: r.subscriberEmail,
    status: r.status, enrolled_at: r.enrolledAt,
    completed_at: r.completedAt, cancelled_at: r.cancelledAt, trigger_ref: r.triggerRef,
  }))
}

// ─── Send-Erfassung ────────────────────────────────────────────────────

/**
 * Legt für eine von einer Graph-Automation verschickte Mail eine Send-Zeile an.
 *
 * Ohne diese Zeile findet der Resend-Webhook zu der resend_email_id nichts —
 * weder hier noch in newsletter_recipients — und verwirft Klicks, Bounces und
 * Beschwerden stillschweigend. Besonders folgenreich beim Bounce: eine tote
 * Adresse würde von der Automation immer weiter angeschrieben, was die
 * Zustellbarkeit der ganzen Domain beschädigt.
 *
 * step_id bleibt NULL — Graph-Nodes haben keine Zeile in
 * email_automation_steps, sie identifizieren sich über node_id.
 */
export async function recordGraphAutomationSend(
  enrollmentId: number,
  nodeId: string,
  resendEmailId: string | null,
): Promise<void> {
  const db = getDb()
  await db.insert(emailAutomationSends).values({
    enrollmentId,
    stepId: null,
    nodeId,
    resendEmailId,
  })
}

// ─── Webhook Event Tracking ────────────────────────────────────────────

export async function updateAutomationSendEvent(
  resendEmailId: string,
  event: 'delivered' | 'clicked' | 'bounced' | 'complained',
  timestamp: string,
  extras?: { bounce_type?: string; bounce_sub_type?: string; bounce_message?: string },
): Promise<void> {
  const db = getDb()

  // Site und Adresse über das Enrollment auflösen — nötig, um bei Bounce oder
  // Beschwerde denselben Subscriber zu sperren, den auch der Newsletter-Pfad
  // sperren würde. Die Site muss dabei aus der Automation kommen: dieselbe
  // Adresse darf laut Schema auf mehreren Sites existieren.
  const existing = await db.select({
    id: emailAutomationSends.id,
    status: emailAutomationSends.status,
    email: emailAutomationEnrollments.subscriberEmail,
    siteId: emailAutomations.siteId,
  })
    .from(emailAutomationSends)
    .innerJoin(emailAutomationEnrollments, eq(emailAutomationEnrollments.id, emailAutomationSends.enrollmentId))
    .innerJoin(emailAutomations, eq(emailAutomations.id, emailAutomationEnrollments.automationId))
    .where(eq(emailAutomationSends.resendEmailId, resendEmailId))
    .limit(1)
  if (existing.length === 0) return

  const { id, status, email, siteId } = existing[0]
  if (status === 'bounced' || status === 'complained') return

  switch (event) {
    case 'delivered':
      await db.run(sql`
        UPDATE email_automation_sends
        SET status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
            delivered_at = COALESCE(delivered_at, ${timestamp})
        WHERE id = ${id}
      `)
      break
    case 'clicked':
      await db.run(sql`
        UPDATE email_automation_sends
        SET status = 'clicked', clicked_at = COALESCE(clicked_at, ${timestamp}), click_count = click_count + 1
        WHERE id = ${id}
      `)
      break
    case 'bounced':
      await db.update(emailAutomationSends)
        .set({
          status: 'bounced',
          bouncedAt: timestamp,
          bounceType: extras?.bounce_type ?? null,
          bounceSubType: extras?.bounce_sub_type ?? null,
          bounceMessage: extras?.bounce_message ?? null,
        })
        .where(eq(emailAutomationSends.id, id))
      // Ein Hard Bounce muss die Adresse sperren, egal aus welchem Kanal er
      // kommt. Vorher passierte das nur im Newsletter-Pfad — eine Automation
      // hätte eine tote Adresse endlos weiter angeschrieben.
      if (isPermanentBounce(extras?.bounce_type)) {
        await blockSubscriberWithReason(siteId, email, 'bounced')
      }
      break
    case 'complained':
      await db.update(emailAutomationSends)
        .set({ status: 'complained', complainedAt: timestamp })
        .where(eq(emailAutomationSends.id, id))
      await blockSubscriberWithReason(siteId, email, 'complained')
      break
  }
}

/**
 * Hat der Subscriber eine Mail AUS DIESER Automation geklickt?
 *
 * Grobkörniger als der Newsletter-Pfad: email_automation_sends hält nur die
 * Klickanzahl, nicht die geklickten URLs. Ein URL-Filter lässt sich hier also
 * nicht auswerten — der Aufrufer muss das berücksichtigen, statt stillschweigend
 * jeden Klick als Treffer zu werten (siehe executeCondition in graph-processor).
 */
export async function hasClickedAutomationEmail(enrollmentId: number): Promise<boolean> {
  const db = getDb()
  const rows = await db.select({ id: emailAutomationSends.id })
    .from(emailAutomationSends)
    .where(and(
      eq(emailAutomationSends.enrollmentId, enrollmentId),
      sql`${emailAutomationSends.clickCount} > 0`,
    ))
    .limit(1)
  return rows.length > 0
}



// ─── Manual Enrollment ──────────────────────────────────────────────────

export async function manualEnroll(automationId: number, emails: string[]): Promise<number> {
  const { enrollInGraph } = await import('./graph-automation')
  let count = 0
  for (const email of emails) {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) continue
    const id = await enrollInGraph(automationId, trimmed, 'manual')
    if (id) count++
  }
  return count
}
