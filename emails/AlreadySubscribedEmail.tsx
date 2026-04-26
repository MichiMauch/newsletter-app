import { Heading, Link, Text } from '@react-email/components'
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

export interface AlreadySubscribedEmailProps {
  site: SiteConfig
  unsubscribeUrl: string
}

export function AlreadySubscribedEmail({ site, unsubscribeUrl }: AlreadySubscribedEmailProps) {
  const accentColor = sanitizeColor(site.accent_color)
  return (
    <TransactionalLayout
      site={site}
      preview={`Du bist bereits für den ${site.name} Newsletter angemeldet`}
    >
      <Heading as="h2" className={headingClass} style={headingStyle}>
        Du bist bereits dabei!
      </Heading>
      <Text className={paragraphClass} style={paragraphStyle}>
        Gute Nachricht — deine E-Mail-Adresse ist bereits für den {site.name} Newsletter
        bestätigt. Du musst nichts weiter tun und erhältst unsere nächsten Beiträge automatisch.
      </Text>
      <CtaButton href={site.site_url} color={accentColor}>
        Zur Website
      </CtaButton>
      <Text className={mutedClass} style={mutedStyle}>
        Wenn du dich nicht erneut angemeldet hast, kannst du diese E-Mail einfach ignorieren.
        Möchtest du den Newsletter nicht mehr erhalten?{' '}
        <Link href={unsubscribeUrl} className="e-link-muted" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
          Hier abmelden
        </Link>
        .
      </Text>
    </TransactionalLayout>
  )
}

AlreadySubscribedEmail.PreviewProps = {
  site: PREVIEW_SITE_CONFIG,
  unsubscribeUrl: 'https://example.com/unsubscribe?token=preview-token',
} satisfies AlreadySubscribedEmailProps

export default AlreadySubscribedEmail
