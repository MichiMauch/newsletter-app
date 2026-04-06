'use client'

import type { NodeProps } from '@xyflow/react'
import NodeShell from './NodeShell'
import type {
  TriggerNodeConfig,
  DelayNodeConfig,
  EmailNodeConfig,
  LastNewsletterNodeConfig,
  ConditionNodeConfig,
  TagNodeConfig,
} from '@/lib/graph-types'
import { CONDITION_TYPE_LABELS } from '@/lib/graph-types'

const TRIGGER_LABELS_SHORT: Record<string, string> = {
  subscriber_confirmed: 'Nach Bestätigung',
  manual: 'Manuell',
  no_activity_days: 'Inaktivität',
  link_clicked: 'Link geklickt',
}

function BoltIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
function RepeatIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
function BranchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )
}
function TagIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

// ─── Nodes ─────────────────────────────────────────────────────────────

export function TriggerNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as TriggerNodeConfig) || { trigger_type: 'subscriber_confirmed' }
  let subtitle = ''
  if (config.trigger_type === 'no_activity_days' && config.days) subtitle = `nach ${config.days} Tagen`
  if (config.trigger_type === 'link_clicked' && config.url_contains) subtitle = `URL: ${config.url_contains}`

  return (
    <NodeShell
      icon={<BoltIcon />}
      label="Trigger"
      title={TRIGGER_LABELS_SHORT[config.trigger_type] || config.trigger_type}
      subtitle={subtitle}
      colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      selected={selected}
      showTargetHandle={false}
    />
  )
}

export function DelayNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as DelayNodeConfig) || { delay_hours: 0 }
  const hours = config.delay_hours
  let title = `${hours} Std.`
  if (hours >= 24 * 7 && hours % (24 * 7) === 0) title = `${hours / (24 * 7)} Wochen`
  else if (hours >= 24 && hours % 24 === 0) title = `${hours / 24} Tage`

  return (
    <NodeShell
      icon={<ClockIcon />}
      label="Warten"
      title={title}
      colorClass="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
      selected={selected}
    />
  )
}

export function EmailNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as EmailNodeConfig) || { subject: '', blocks_json: '[]' }
  return (
    <NodeShell
      icon={<MailIcon />}
      label="E-Mail"
      title={config.subject || 'Kein Betreff'}
      colorClass="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
      selected={selected}
    />
  )
}

export function LastNewsletterNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as LastNewsletterNodeConfig) || {}
  return (
    <NodeShell
      icon={<RepeatIcon />}
      label="Letzter Newsletter"
      title={config.subject_override || 'Automatisch'}
      colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      selected={selected}
    />
  )
}

export function ConditionNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as ConditionNodeConfig) || { condition_type: 'has_tag' }
  let subtitle = ''
  if (config.condition_type === 'has_tag' && config.tag) subtitle = config.tag
  if (config.condition_type === 'clicked_link' && config.url_contains) subtitle = config.url_contains

  return (
    <NodeShell
      icon={<BranchIcon />}
      label="Bedingung"
      title={CONDITION_TYPE_LABELS[config.condition_type] || 'Bedingung'}
      subtitle={subtitle}
      colorClass="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      selected={selected}
      conditionBranches
    />
  )
}

export function TagNodeView({ data, selected }: NodeProps) {
  const config = (data?.config as TagNodeConfig) || { action: 'add', tag: '' }
  const title = `${config.action === 'add' ? '+ ' : '− '}${config.tag || 'Tag'}`
  return (
    <NodeShell
      icon={<TagIcon />}
      label="Tag"
      title={title}
      colorClass="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
      selected={selected}
    />
  )
}

export const nodeTypes = {
  trigger: TriggerNodeView,
  delay: DelayNodeView,
  email: EmailNodeView,
  last_newsletter: LastNewsletterNodeView,
  condition: ConditionNodeView,
  tag: TagNodeView,
}
