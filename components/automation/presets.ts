import type { TriggerType, TriggerConfig } from './types'

export interface AutomationPreset {
  id: string
  label: string
  description: string
  trigger: TriggerType
  triggerConfig: TriggerConfig
  defaultName: string
  steps: Array<{
    step_type: 'email' | 'last_newsletter'
    delay_hours: number
    subject: string
    blocks_json: string
  }>
}

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    id: 'welcome',
    label: 'Willkommen + letzter Newsletter',
    description: 'Neue Abonnenten erhalten sofort den letzten Newsletter als Willkommens-E-Mail.',
    trigger: 'subscriber_confirmed',
    triggerConfig: {},
    defaultName: 'Willkommen + letzter Newsletter',
    steps: [
      {
        step_type: 'last_newsletter',
        delay_hours: 0,
        subject: '',
        blocks_json: '[]',
      },
    ],
  },
  {
    id: 'reengagement',
    label: 'Re-Engagement',
    description: 'Abonnenten, die 30 Tage lang keinen Link geklickt haben, erhalten eine Erinnerung.',
    trigger: 'no_activity_days',
    triggerConfig: { days: 30 },
    defaultName: 'Re-Engagement nach 30 Tagen',
    steps: [
      {
        step_type: 'email',
        delay_hours: 0,
        subject: 'Wir vermissen dich!',
        blocks_json: JSON.stringify([
          { id: 'reeng-text', type: 'text', content: 'Hallo! Wir haben bemerkt, dass du schon eine Weile keinen unserer Newsletter geöffnet hast. Hier ist eine Zusammenfassung von dem, was du verpasst hast:' },
        ]),
      },
    ],
  },
  {
    id: 'blank',
    label: 'Leere Automation',
    description: 'Starte mit einer leeren Automation und konfiguriere alles selbst.',
    trigger: 'subscriber_confirmed',
    triggerConfig: {},
    defaultName: '',
    steps: [],
  },
]
