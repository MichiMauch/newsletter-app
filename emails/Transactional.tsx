import { type ReactNode } from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { SiteConfig } from '@/lib/site-config'
import { sanitizeColor, sanitizeFontFamily } from '@/lib/newsletter-template'

function TransactionalLayout({
  site,
  preview,
  children,
}: {
  site: SiteConfig
  preview: string
  children: ReactNode
}) {
  const primaryColor = sanitizeColor(site.primary_color)
  const accentColor = sanitizeColor(site.accent_color)
  const gradientEnd = sanitizeColor(site.gradient_end)
  const fontFamily = `'${sanitizeFontFamily(site.font_family)}', system-ui, -apple-system, sans-serif`
  const hostname = new URL(site.site_url).hostname

  return (
    <Html lang={site.locale.split('-')[0]}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#f3f4f6', fontFamily }}>
        <Container
          style={{
            maxWidth: 600,
            margin: '0 auto',
            background: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
          }}
        >
          <Section
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${gradientEnd})`,
              padding: '24px 32px',
              textAlign: 'center',
            }}
          >
            {site.logo_url ? (
              <Img
                src={site.logo_url}
                alt={site.name}
                width={48}
                height={48}
                style={{ display: 'inline-block', marginBottom: 8 }}
              />
            ) : null}
            <Heading
              as="h1"
              style={{ color: '#ffffff', margin: 0, fontSize: 20, fontWeight: 600 }}
            >
              {site.name}
            </Heading>
          </Section>

          <Section style={{ padding: 32 }}>{children}</Section>

          <Section
            style={{
              background: '#f9fafb',
              padding: '16px 32px',
              borderTop: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <Text style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
              Diese E-Mail wurde automatisch von{' '}
              <Link href={site.site_url} style={{ color: accentColor, textDecoration: 'none' }}>
                {hostname}
              </Link>{' '}
              gesendet.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

function CtaButton({ href, color, children }: { href: string; color: string; children: ReactNode }) {
  return (
    <Section style={{ textAlign: 'center', margin: '32px 0' }}>
      <Button
        href={href}
        style={{
          display: 'inline-block',
          background: color,
          color: '#ffffff',
          padding: '14px 36px',
          borderRadius: 999,
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

const headingStyle = { color: '#111827', marginTop: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3 } as const
const paragraphStyle = { color: '#374151', lineHeight: 1.6, fontSize: 14, margin: '0 0 12px' } as const
const mutedStyle = { color: '#9ca3af', fontSize: 13, lineHeight: 1.5, margin: '24px 0 0' } as const

export interface ConfirmationEmailProps {
  site: SiteConfig
  confirmUrl: string
}

export function ConfirmationEmail({ site, confirmUrl }: ConfirmationEmailProps) {
  const accentColor = sanitizeColor(site.accent_color)
  return (
    <TransactionalLayout site={site} preview={`Bestätige deine Anmeldung auf ${site.name}`}>
      <Heading as="h2" style={headingStyle}>
        Fast geschafft!
      </Heading>
      <Text style={paragraphStyle}>
        Du hast dich für den {site.name} Newsletter angemeldet. Bitte bestätige deine
        E-Mail-Adresse, damit wir dir künftig direkt schreiben können.
      </Text>
      <CtaButton href={confirmUrl} color={accentColor}>
        Anmeldung bestätigen
      </CtaButton>
      <Text style={mutedStyle}>
        Wenn du dich nicht angemeldet hast, kannst du diese E-Mail einfach ignorieren.
      </Text>
    </TransactionalLayout>
  )
}

export interface AlreadySubscribedEmailProps {
  site: SiteConfig
}

export function AlreadySubscribedEmail({ site }: AlreadySubscribedEmailProps) {
  const accentColor = sanitizeColor(site.accent_color)
  return (
    <TransactionalLayout
      site={site}
      preview={`Du bist bereits für den ${site.name} Newsletter angemeldet`}
    >
      <Heading as="h2" style={headingStyle}>
        Du bist bereits dabei!
      </Heading>
      <Text style={paragraphStyle}>
        Gute Nachricht — deine E-Mail-Adresse ist bereits für den {site.name} Newsletter
        bestätigt. Du musst nichts weiter tun und erhältst unsere nächsten Beiträge automatisch.
      </Text>
      <CtaButton href={site.site_url} color={accentColor}>
        Zur Website
      </CtaButton>
      <Text style={mutedStyle}>
        Wenn du dich nicht erneut angemeldet hast, kannst du diese E-Mail einfach ignorieren.
      </Text>
    </TransactionalLayout>
  )
}
