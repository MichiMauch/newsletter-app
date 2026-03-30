/**
 * Email automation data layer — Drizzle ORM
 * Manages drip campaigns: automations, steps, enrollments, sends
 */

import { eq, and, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  emailAutomations,
  emailAutomationSteps,
  emailAutomationEnrollments,
  emailAutomationSends,
} from './schema'

// ─── Types ─────────────────────────────────────────────────────────────

export interface Automation {
  id: number
  site_id: string
  name: string
  trigger_type: string
  active: number
  created_at: string
  updated_at: string
  step_count?: number
  enrollment_count?: number
}

export interface AutomationStep {
  id: number
  automation_id: number
  step_order: number
  delay_hours: number
  subject: string
  blocks_json: string
  created_at: string
  updated_at: string
}

export interface AutomationEnrollment {
  id: number
  automation_id: number
  subscriber_email: string
  status: 'active' | 'completed' | 'cancelled'
  enrolled_at: string
  completed_at: string | null
  cancelled_at: string | null
}

export interface PendingSend {
  enrollment_id: number
  subscriber_email: string
  enrolled_at: string
  step_id: number
  step_order: number
  delay_hours: number
  subject: string
  blocks_json: string
  automation_id: number
  automation_name: string
  site_id: string
}

// ─── Automation CRUD ───────────────────────────────────────────────────

export async function listAutomations(siteId: string): Promise<Automation[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT a.*,
      (SELECT COUNT(*) FROM email_automation_steps WHERE automation_id = a.id) AS step_count,
      (SELECT COUNT(*) FROM email_automation_enrollments WHERE automation_id = a.id) AS enrollment_count
    FROM email_automations a WHERE a.site_id = ${siteId} ORDER BY a.created_at DESC
  `)
  return (rows.rows ?? []).map((r) => ({
    id: r.id as number, site_id: r.site_id as string, name: r.name as string,
    trigger_type: r.trigger_type as string, active: r.active as number,
    created_at: r.created_at as string, updated_at: r.updated_at as string,
    step_count: r.step_count as number, enrollment_count: r.enrollment_count as number,
  }))
}

export async function getAutomation(id: number): Promise<{ automation: Automation; steps: AutomationStep[] } | null> {
  const db = getDb()
  const aRows = await db.select().from(emailAutomations).where(eq(emailAutomations.id, id)).limit(1)
  if (aRows.length === 0) return null

  const a = aRows[0]
  const automation: Automation = {
    id: a.id, site_id: a.siteId, name: a.name, trigger_type: a.triggerType,
    active: a.active, created_at: a.createdAt, updated_at: a.updatedAt,
  }

  const sRows = await db.select().from(emailAutomationSteps)
    .where(eq(emailAutomationSteps.automationId, id))
    .orderBy(emailAutomationSteps.stepOrder)

  const steps: AutomationStep[] = sRows.map((s) => ({
    id: s.id, automation_id: s.automationId, step_order: s.stepOrder,
    delay_hours: s.delayHours, subject: s.subject, blocks_json: s.blocksJson,
    created_at: s.createdAt, updated_at: s.updatedAt,
  }))

  return { automation, steps }
}

export async function createAutomation(siteId: string, name: string, triggerType: string): Promise<number> {
  const db = getDb()
  const result = await db.insert(emailAutomations).values({ siteId, name, triggerType }).returning({ id: emailAutomations.id })
  return result[0].id
}

export async function updateAutomation(id: number, data: { name?: string; trigger_type?: string; active?: number }): Promise<void> {
  const db = getDb()
  const set: Record<string, unknown> = { updatedAt: sql`datetime('now')` }
  if (data.name !== undefined) set.name = data.name
  if (data.trigger_type !== undefined) set.triggerType = data.trigger_type
  if (data.active !== undefined) set.active = data.active
  await db.update(emailAutomations).set(set).where(eq(emailAutomations.id, id))
}

export async function deleteAutomation(id: number): Promise<void> {
  const db = getDb()
  await db.delete(emailAutomations).where(eq(emailAutomations.id, id))
}

// ─── Step CRUD ─────────────────────────────────────────────────────────

export async function saveStep(data: {
  id?: number; automation_id: number; step_order: number; delay_hours: number; subject: string; blocks_json: string
}): Promise<number> {
  const db = getDb()

  if (data.id) {
    await db.update(emailAutomationSteps).set({
      stepOrder: data.step_order, delayHours: data.delay_hours,
      subject: data.subject, blocksJson: data.blocks_json, updatedAt: sql`datetime('now')`,
    }).where(eq(emailAutomationSteps.id, data.id))
    return data.id
  }

  const result = await db.insert(emailAutomationSteps).values({
    automationId: data.automation_id, stepOrder: data.step_order,
    delayHours: data.delay_hours, subject: data.subject, blocksJson: data.blocks_json,
  }).returning({ id: emailAutomationSteps.id })
  return result[0].id
}

export async function deleteStep(id: number): Promise<void> {
  const db = getDb()
  await db.delete(emailAutomationSteps).where(eq(emailAutomationSteps.id, id))
}

export async function reorderSteps(automationId: number, stepIds: number[]): Promise<void> {
  const db = getDb()
  for (let i = 0; i < stepIds.length; i++) {
    await db.update(emailAutomationSteps).set({
      stepOrder: i, updatedAt: sql`datetime('now')`,
    }).where(and(eq(emailAutomationSteps.id, stepIds[i]), eq(emailAutomationSteps.automationId, automationId)))
  }
}

// ─── Enrollment ────────────────────────────────────────────────────────

export async function enrollSubscriber(siteId: string, email: string, triggerType: string): Promise<number> {
  const db = getDb()
  const automations = await db.select({ id: emailAutomations.id })
    .from(emailAutomations)
    .where(and(eq(emailAutomations.siteId, siteId), eq(emailAutomations.triggerType, triggerType), eq(emailAutomations.active, 1)))

  let count = 0
  for (const row of automations) {
    try {
      await db.insert(emailAutomationEnrollments).values({ automationId: row.id, subscriberEmail: email })
      count++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('UNIQUE')) continue
      throw err
    }
  }
  return count
}

export async function cancelEnrollments(email: string): Promise<void> {
  const db = getDb()
  await db.update(emailAutomationEnrollments)
    .set({ status: 'cancelled', cancelledAt: sql`datetime('now')` })
    .where(and(eq(emailAutomationEnrollments.subscriberEmail, email), eq(emailAutomationEnrollments.status, 'active')))
}

export async function getEnrollments(automationId: number): Promise<AutomationEnrollment[]> {
  const db = getDb()
  const rows = await db.select().from(emailAutomationEnrollments)
    .where(eq(emailAutomationEnrollments.automationId, automationId))
    .orderBy(sql`${emailAutomationEnrollments.enrolledAt} DESC`)
  return rows.map((r) => ({
    id: r.id, automation_id: r.automationId, subscriber_email: r.subscriberEmail,
    status: r.status, enrolled_at: r.enrolledAt,
    completed_at: r.completedAt, cancelled_at: r.cancelledAt,
  }))
}

// ─── Send Processing ───────────────────────────────────────────────────

export async function getPendingSends(): Promise<PendingSend[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      e.id AS enrollment_id, e.subscriber_email, e.enrolled_at,
      s.id AS step_id, s.step_order, s.delay_hours, s.subject, s.blocks_json,
      a.id AS automation_id, a.name AS automation_name, a.site_id
    FROM email_automation_enrollments e
    JOIN email_automations a ON a.id = e.automation_id AND a.active = 1
    JOIN email_automation_steps s ON s.automation_id = a.id
    LEFT JOIN email_automation_sends sent ON sent.enrollment_id = e.id AND sent.step_id = s.id
    WHERE e.status = 'active' AND sent.id IS NULL
      AND datetime(e.enrolled_at, '+' || s.delay_hours || ' hours') <= datetime('now')
    ORDER BY e.id, s.step_order
  `)
  return (rows.rows ?? []).map((r) => ({
    enrollment_id: r.enrollment_id as number, subscriber_email: r.subscriber_email as string,
    enrolled_at: r.enrolled_at as string, step_id: r.step_id as number,
    step_order: r.step_order as number, delay_hours: r.delay_hours as number,
    subject: r.subject as string, blocks_json: r.blocks_json as string,
    automation_id: r.automation_id as number, automation_name: r.automation_name as string,
    site_id: r.site_id as string,
  }))
}

export async function recordAutomationSend(enrollmentId: number, stepId: number, resendEmailId: string | null): Promise<void> {
  const db = getDb()
  await db.insert(emailAutomationSends).values({ enrollmentId, stepId, resendEmailId })
}

export async function markEnrollmentCompleted(enrollmentId: number): Promise<void> {
  const db = getDb()
  await db.update(emailAutomationEnrollments)
    .set({ status: 'completed', completedAt: sql`datetime('now')` })
    .where(eq(emailAutomationEnrollments.id, enrollmentId))
}

export async function isEnrollmentComplete(enrollmentId: number, automationId: number): Promise<boolean> {
  const db = getDb()
  const totalRows = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(emailAutomationSteps).where(eq(emailAutomationSteps.automationId, automationId))
  const sentRows = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(emailAutomationSends).where(eq(emailAutomationSends.enrollmentId, enrollmentId))
  return (sentRows[0]?.cnt ?? 0) >= (totalRows[0]?.cnt ?? 0)
}

// ─── Webhook Event Tracking ────────────────────────────────────────────

export async function updateAutomationSendEvent(
  resendEmailId: string,
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained',
  timestamp: string,
  extras?: { bounce_type?: string },
): Promise<void> {
  const db = getDb()

  const existing = await db.select({
    id: emailAutomationSends.id, status: emailAutomationSends.status,
  }).from(emailAutomationSends).where(eq(emailAutomationSends.resendEmailId, resendEmailId)).limit(1)
  if (existing.length === 0) return

  const { id, status } = existing[0]
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
    case 'opened':
      await db.run(sql`
        UPDATE email_automation_sends
        SET status = CASE WHEN status IN ('sent', 'delivered') THEN 'opened' ELSE status END,
            opened_at = COALESCE(opened_at, ${timestamp}), open_count = open_count + 1
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
        .set({ status: 'bounced', bouncedAt: timestamp, bounceType: extras?.bounce_type ?? null })
        .where(eq(emailAutomationSends.id, id))
      break
    case 'complained':
      await db.update(emailAutomationSends)
        .set({ status: 'complained', complainedAt: timestamp })
        .where(eq(emailAutomationSends.id, id))
      break
  }
}

// ─── Stats ─────────────────────────────────────────────────────────────

export async function getAutomationStepStats(automationId: number): Promise<{
  step_id: number; step_order: number; subject: string
  total_sent: number; delivered: number; opened: number; clicked: number; bounced: number
}[]> {
  const db = getDb()
  const rows = await db.run(sql`
    SELECT
      s.id AS step_id, s.step_order, s.subject,
      COUNT(sent.id) AS total_sent,
      SUM(CASE WHEN sent.status IN ('delivered','opened','clicked') THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN sent.status IN ('opened','clicked') THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN sent.status = 'clicked' THEN 1 ELSE 0 END) AS clicked,
      SUM(CASE WHEN sent.status = 'bounced' THEN 1 ELSE 0 END) AS bounced
    FROM email_automation_steps s
    LEFT JOIN email_automation_sends sent ON sent.step_id = s.id
    WHERE s.automation_id = ${automationId}
    GROUP BY s.id ORDER BY s.step_order
  `)
  return (rows.rows ?? []).map((r) => ({
    step_id: r.step_id as number, step_order: r.step_order as number, subject: r.subject as string,
    total_sent: r.total_sent as number, delivered: r.delivered as number,
    opened: r.opened as number, clicked: r.clicked as number, bounced: r.bounced as number,
  }))
}
