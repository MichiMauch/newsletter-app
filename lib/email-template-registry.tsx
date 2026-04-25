import { render } from '@react-email/render'
import Newsletter from '@/emails/Newsletter'
import NewsletterMultiBlock from '@/emails/NewsletterMultiBlock'
import ConfirmationEmail from '@/emails/ConfirmationEmail'
import AlreadySubscribedEmail from '@/emails/AlreadySubscribedEmail'

interface RegistryEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: React.ComponentType<any> & { PreviewProps?: unknown }
  label: string
  description: string
}

const REGISTRY = {
  Newsletter: {
    Component: Newsletter,
    label: 'Newsletter (Single-Post)',
    description: 'Wird automatisch versendet wenn ein neuer Artikel publiziert wird.',
  },
  NewsletterMultiBlock: {
    Component: NewsletterMultiBlock,
    label: 'Newsletter (Multi-Block)',
    description: 'Manuell zusammengestelltes Newsletter — Hero, Freitext, Link-Listen.',
  },
  ConfirmationEmail: {
    Component: ConfirmationEmail,
    label: 'Anmelde-Bestätigung',
    description: 'Double-Opt-In Mail beim Anmelden mit Bestätigungs-Link.',
  },
  AlreadySubscribedEmail: {
    Component: AlreadySubscribedEmail,
    label: 'Bereits angemeldet',
    description: 'Hinweis-Mail wenn sich jemand mit existierender Adresse erneut anmeldet.',
  },
} satisfies Record<string, RegistryEntry>

export type TemplateKey = keyof typeof REGISTRY

export const TEMPLATE_LIST: { key: TemplateKey; label: string; description: string }[] =
  Object.entries(REGISTRY).map(([key, v]) => ({
    key: key as TemplateKey,
    label: v.label,
    description: v.description,
  }))

export function isTemplateKey(s: string): s is TemplateKey {
  return s in REGISTRY
}

export async function renderTemplateByKey(
  key: TemplateKey,
  options: { plainText?: boolean } = {},
): Promise<string> {
  const entry = REGISTRY[key]
  const Component = entry.Component
  const props = entry.Component.PreviewProps ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = <Component {...(props as any)} />
  return render(node, options.plainText ? { plainText: true } : undefined)
}
