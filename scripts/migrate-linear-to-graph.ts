/**
 * Migrate existing linear automations to graph-based workflows.
 *
 * For each automation:
 * 1. Read trigger_type + trigger_config from the automation row
 * 2. Read all email_automation_steps ordered by step_order
 * 3. Create a trigger node, then for each step:
 *    - If delay_hours > 0: create a delay node first
 *    - Create an email or last_newsletter node
 *    - Chain edges between nodes
 * 4. Update active enrollments: set current_node_id to the trigger node
 *
 * Idempotent: skips automations that already have graph nodes.
 */

import 'dotenv/config'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and, sql } from 'drizzle-orm'
import {
  emailAutomations,
  emailAutomationSteps,
  emailAutomationEnrollments,
  automationNodes,
  automationEdges,
} from '../lib/schema'
import type { TriggerNodeConfig, DelayNodeConfig, EmailNodeConfig, LastNewsletterNodeConfig, NodeConfig } from '../lib/graph-types'

const NODE_X = 120
const NODE_Y_STEP = 150

function uuid(): string {
  return crypto.randomUUID()
}

async function main() {
  const url = process.env.TURSO_DB_URL
  const token = process.env.TURSO_DB_TOKEN
  if (!url || !token) {
    console.error('Missing TURSO_DB_URL or TURSO_DB_TOKEN')
    process.exit(1)
  }
  const client = createClient({ url, authToken: token })
  const db = drizzle(client)

  const automations = await db.select().from(emailAutomations)
  console.log(`Found ${automations.length} automations.`)

  let migrated = 0
  let skipped = 0

  for (const auto of automations) {
    // Check if already migrated (has any nodes)
    const existingNodes = await db.select({ id: automationNodes.id })
      .from(automationNodes)
      .where(eq(automationNodes.automationId, auto.id))
      .limit(1)
    if (existingNodes.length > 0) {
      console.log(`  ⊘ #${auto.id} "${auto.name}" — already has graph, skipping`)
      skipped++
      continue
    }

    const steps = await db.select().from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.automationId, auto.id))
      .orderBy(emailAutomationSteps.stepOrder)

    // Build trigger node config from legacy trigger_type + trigger_config
    const triggerConfig: TriggerNodeConfig = {
      trigger_type: (auto.triggerType ?? 'subscriber_confirmed') as TriggerNodeConfig['trigger_type'],
      ...JSON.parse((auto.triggerConfig as string) || '{}'),
    }

    const triggerId = uuid()
    const nodesToInsert: Array<{
      id: string
      automationId: number
      nodeType: 'trigger' | 'delay' | 'email' | 'last_newsletter' | 'condition' | 'tag'
      configJson: string
      positionX: number
      positionY: number
    }> = [{
      id: triggerId,
      automationId: auto.id,
      nodeType: 'trigger',
      configJson: JSON.stringify(triggerConfig),
      positionX: NODE_X,
      positionY: 40,
    }]
    const edgesToInsert: Array<{
      id: string
      automationId: number
      sourceNodeId: string
      targetNodeId: string
      edgeLabel: string | null
    }> = []

    let prevNodeId = triggerId
    let y = 40

    for (const step of steps) {
      // If delay > 0 AND this isn't the first step, insert a delay node
      // (First-step delays are unusual — but we still convert them)
      if (step.delayHours > 0) {
        y += NODE_Y_STEP
        const delayId = uuid()
        const delayConfig: DelayNodeConfig = { delay_hours: step.delayHours }
        nodesToInsert.push({
          id: delayId,
          automationId: auto.id,
          nodeType: 'delay',
          configJson: JSON.stringify(delayConfig),
          positionX: NODE_X,
          positionY: y,
        })
        edgesToInsert.push({
          id: uuid(),
          automationId: auto.id,
          sourceNodeId: prevNodeId,
          targetNodeId: delayId,
          edgeLabel: null,
        })
        prevNodeId = delayId
      }

      // Create email or last_newsletter node
      y += NODE_Y_STEP
      const nodeId = uuid()
      let config: NodeConfig
      if (step.stepType === 'last_newsletter') {
        const lnConfig: LastNewsletterNodeConfig = {}
        config = lnConfig
      } else {
        const emailConfig: EmailNodeConfig = {
          subject: step.subject,
          blocks_json: step.blocksJson,
        }
        config = emailConfig
      }
      nodesToInsert.push({
        id: nodeId,
        automationId: auto.id,
        nodeType: step.stepType as 'email' | 'last_newsletter',
        configJson: JSON.stringify(config),
        positionX: NODE_X,
        positionY: y,
      })
      edgesToInsert.push({
        id: uuid(),
        automationId: auto.id,
        sourceNodeId: prevNodeId,
        targetNodeId: nodeId,
        edgeLabel: null,
      })
      prevNodeId = nodeId
    }

    // Insert nodes + edges
    if (nodesToInsert.length > 0) {
      await db.insert(automationNodes).values(nodesToInsert)
    }
    if (edgesToInsert.length > 0) {
      await db.insert(automationEdges).values(edgesToInsert)
    }

    // Update active enrollments to point to trigger node
    await db.update(emailAutomationEnrollments)
      .set({ currentNodeId: triggerId })
      .where(and(
        eq(emailAutomationEnrollments.automationId, auto.id),
        eq(emailAutomationEnrollments.status, 'active'),
      ))

    console.log(`  ✓ #${auto.id} "${auto.name}" — ${nodesToInsert.length} nodes, ${edgesToInsert.length} edges`)
    migrated++
  }

  console.log(`\nDone. Migrated: ${migrated}, skipped: ${skipped}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
