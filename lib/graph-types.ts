/**
 * Graph-based automation workflow types
 */

export type NodeType = 'trigger' | 'delay' | 'email' | 'last_newsletter' | 'condition' | 'tag'

export type TriggerType = 'subscriber_confirmed' | 'manual' | 'no_activity_days' | 'link_clicked' | 'engagement_below'

// ─── Node Config Shapes ────────────────────────────────────────────────

export interface TriggerNodeConfig {
  trigger_type: TriggerType
  days?: number           // no_activity_days
  url_contains?: string   // link_clicked
  threshold?: number      // engagement_below (Score 0-100)
}

export interface DelayNodeConfig {
  delay_hours: number
}

export interface EmailNodeConfig {
  subject: string
  blocks_json: string
}

export interface LastNewsletterNodeConfig {
  subject_override?: string
}

export type ConditionType = 'has_tag' | 'clicked_link' | 'opened_email'

export interface ConditionNodeConfig {
  condition_type: ConditionType
  tag?: string                // has_tag
  url_contains?: string       // clicked_link
  email_node_id?: string      // opened_email / clicked_link — limit to specific email node
}

export type TagAction = 'add' | 'remove'

export interface TagNodeConfig {
  action: TagAction
  tag: string
}

export type NodeConfig =
  | TriggerNodeConfig
  | DelayNodeConfig
  | EmailNodeConfig
  | LastNewsletterNodeConfig
  | ConditionNodeConfig
  | TagNodeConfig

// ─── DB Row Types ──────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  automation_id: number
  node_type: NodeType
  config: NodeConfig
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export interface GraphEdge {
  id: string
  automation_id: number
  source_node_id: string
  target_node_id: string
  edge_label: 'yes' | 'no' | null
  created_at: string
}

export interface NodeExecution {
  id: number
  enrollment_id: number
  node_id: string
  status: 'pending' | 'completed' | 'failed' | 'skipped'
  started_at: string
  completed_at: string | null
  error: string | null
  output: Record<string, unknown> | null
  retry_count: number
}

export interface GraphRun {
  enrollment_id: number
  subscriber_email: string
  current_node_id: string | null
  context: Record<string, unknown>
  enrolled_at: string
  site_id: string
  automation_id: number
  automation_name: string
}

// ─── Labels ─────────────────────────────────────────────────────────────

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  trigger: 'Trigger',
  delay: 'Warten',
  email: 'E-Mail',
  last_newsletter: 'Letzter Newsletter',
  condition: 'Bedingung',
  tag: 'Tag',
}

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  has_tag: 'Hat Tag',
  clicked_link: 'Hat Link geklickt',
  opened_email: 'Hat E-Mail geöffnet',
}
