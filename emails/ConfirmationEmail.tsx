import { Heading, Text } from '@react-email/components'
import type { SiteConfig } from '@/lib/site-config'
import { sanitizeColor } from '@/lib/newsletter-template'
import {
  TransactionalLayout,
  CtaButton,
  headingStyle,
  paragraphStyle,
  mutedStyle,
  headingClass,
  paragraphClass,
  mutedClass,
} from './_layout'
import { PREVIEW_SITE_CONFIG } from './_preview-data'

export interface ConfirmationEmailProps {
  site: SiteConfig
  confirmUrl: string
}

export function ConfirmationEmail({ site, confirmUrl }: ConfirmationEmailProps) {
  const accentColor = sanitizeColor(site.accent_color)
  return (
    <TransactionalLayout site={site} preview={`Bestätige deine Anmeldung auf ${site.name}`}>
      <Heading as="h2" className={headingClass} style={headingStyle}>
        Fast geschafft!
      </Heading>
      <Text className={paragraphClass} style={paragraphStyle}>
        Du hast dich für den {site.name} Newsletter angemeldet. Bitte bestätige deine
        E-Mail-Adresse, damit wir dir künftig direkt schreiben können.
      </Text>
      <CtaButton href={confirmUrl} color={accentColor}>
        Anmeldung bestätigen
      </CtaButton>
      <Text className={mutedClass} style={mutedStyle}>
        Wenn du dich nicht angemeldet hast, kannst du diese E-Mail einfach ignorieren.
      </Text>
    </TransactionalLayout>
  )
}

ConfirmationEmail.PreviewProps = {
  site: PREVIEW_SITE_CONFIG,
  confirmUrl: 'https://preview.localhost/newsletter/bestaetigen?token=preview-token',
} satisfies ConfirmationEmailProps

export default ConfirmationEmail
