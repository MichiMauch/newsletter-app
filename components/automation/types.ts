export type TriggerType = 'subscriber_confirmed' | 'manual' | 'no_activity_days' | 'link_clicked'

export interface TriggerConfig {
  days?: number
  url_contains?: string
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  subscriber_confirmed: 'Nach Bestätigung',
  manual: 'Manuell einschreiben',
  no_activity_days: 'Inaktivität (kein Klick)',
  link_clicked: 'Nach Klick auf Link',
}

export const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  subscriber_confirmed: 'Wird ausgelöst wenn ein Abonnent seine Anmeldung bestätigt (Double-Opt-In).',
  manual: 'Du schreibst Abonnenten manuell in diese Automation ein.',
  no_activity_days: 'Wird ausgelöst wenn ein Abonnent eine bestimmte Anzahl Tage keinen Link geklickt hat.',
  link_clicked: 'Wird ausgelöst wenn ein Abonnent auf einen bestimmten Link in einem Newsletter klickt.',
}

export interface Automation {
  id: number
  site_id: string
  name: string
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  active: number
  created_at: string
  updated_at: string
  step_count: number
  enrollment_count: number
}

export interface Enrollment {
  id: number
  automation_id: number
  subscriber_email: string
  status: 'active' | 'completed' | 'cancelled'
  enrolled_at: string
  completed_at: string | null
  cancelled_at: string | null
  trigger_ref: string | null
}

export interface WizardData {
  preset: string | null
  name: string
  trigger: TriggerType
  triggerConfig: TriggerConfig
  steps: Array<{
    step_type: 'email' | 'last_newsletter'
    delay_hours: number
    subject: string
    blocks_json: string
  }>
}
