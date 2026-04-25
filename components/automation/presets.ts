import type { TriggerType, TriggerConfig } from './types'

export interface PresetGraphNode {
  key: string // logical id, gemappt auf UUID beim Erstellen
  node_type: 'trigger' | 'delay' | 'email' | 'last_newsletter' | 'condition' | 'tag'
  config: Record<string, unknown>
  position_x: number
  position_y: number
}

export interface PresetGraphEdge {
  source: string // node key
  target: string
  label?: 'yes' | 'no' | null
}

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
  // Falls gesetzt: kompletter Graph mit Verzweigung. Hat Vorrang vor `steps`.
  graph?: {
    nodes: PresetGraphNode[]
    edges: PresetGraphEdge[]
  }
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
    description: 'Abonnenten, die 30 Tage lang keinen Link geklickt haben, erhalten eine Erinnerung mit dem letzten Newsletter als Zusammenfassung.',
    trigger: 'no_activity_days',
    triggerConfig: { days: 30 },
    defaultName: 'Re-Engagement nach 30 Tagen',
    steps: [
      {
        step_type: 'email',
        delay_hours: 0,
        subject: 'Wir vermissen dich!',
        blocks_json: JSON.stringify([
          { id: 'reeng-text', type: 'text', content: 'Hallo! Wir haben bemerkt, dass du schon eine Weile keinen unserer Newsletter geöffnet hast. Hier ist, was du zuletzt verpasst hast:' },
          { id: 'reeng-last', type: 'last_newsletter', recapLabel: 'Unser letzter Newsletter' },
        ]),
      },
    ],
  },
  {
    id: 'engagement_winback',
    label: 'Win-Back bei Engagement-Drop',
    description: 'Wenn der Engagement-Score unter 20 fällt: Win-Back-Mail, 14 Tage warten, dann Tag setzen je nach Klick — du entscheidest manuell über Abmelden.',
    trigger: 'engagement_below',
    triggerConfig: { threshold: 20 },
    defaultName: 'Win-Back bei Engagement-Drop',
    steps: [], // ignoriert, da graph gesetzt
    graph: {
      nodes: [
        {
          key: 'trigger',
          node_type: 'trigger',
          config: { trigger_type: 'engagement_below', threshold: 20 },
          position_x: 280, position_y: 40,
        },
        {
          key: 'email',
          node_type: 'email',
          config: {
            subject: 'Wir haben dich vermisst',
            blocks_json: JSON.stringify([
              {
                id: 'winback-text',
                type: 'text',
                content: 'Hallo!\n\nWir haben gemerkt, dass du unsere Newsletter eine Weile nicht mehr geöffnet hast. Damit das nicht in deinem Postfach untergeht, hier ein kleiner Anstupser.\n\nWenn dich unsere Themen weiter interessieren, klicke einfach unten auf einen Link – dann wissen wir, dass alles ok ist und du Teil der Liste bleiben möchtest.\n\nFalls nicht: kein Stress, du kannst dich jederzeit unten abmelden.',
              },
            ]),
          },
          position_x: 280, position_y: 200,
        },
        {
          key: 'delay',
          node_type: 'delay',
          config: { delay_hours: 14 * 24 },
          position_x: 280, position_y: 360,
        },
        {
          key: 'condition',
          node_type: 'condition',
          config: { condition_type: 'clicked_link', email_node_id: 'email' },
          position_x: 280, position_y: 520,
        },
        {
          key: 'tag_recovered',
          node_type: 'tag',
          config: { action: 'add', tag: 'win_back_recovered' },
          position_x: 100, position_y: 680,
        },
        {
          key: 'tag_failed',
          node_type: 'tag',
          config: { action: 'add', tag: 'win_back_failed' },
          position_x: 460, position_y: 680,
        },
      ],
      edges: [
        { source: 'trigger', target: 'email' },
        { source: 'email', target: 'delay' },
        { source: 'delay', target: 'condition' },
        { source: 'condition', target: 'tag_recovered', label: 'yes' },
        { source: 'condition', target: 'tag_failed', label: 'no' },
      ],
    },
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
