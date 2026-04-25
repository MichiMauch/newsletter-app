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

const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .e-page { background-color: #0f172a !important; }
    .e-card { background-color: #1e293b !important; border-color: #334155 !important; }
    .e-text-heading { color: #f8fafc !important; }
    .e-text-body { color: #cbd5e1 !important; }
    .e-text-muted { color: #94a3b8 !important; }
    .e-footer { background-color: #0f172a !important; border-color: #334155 !important; }
    .e-divider { border-color: #334155 !important; }
    .e-link-muted { color: #94a3b8 !important; }
  }
`

export function EmailHead() {
  return (
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{darkModeCss}</style>
    </Head>
  )
}

export function TransactionalLayout({
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
      <EmailHead />
      <Preview>{preview}</Preview>
      <Body
        className="e-page"
        style={{ margin: 0, padding: 0, backgroundColor: '#f3f4f6', fontFamily }}
      >
        <Container
          className="e-card"
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
            className="e-footer"
            style={{
              background: '#f9fafb',
              padding: '16px 32px',
              borderTop: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <Text className="e-text-muted" style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
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

export function CtaButton({ href, color, children }: { href: string; color: string; children: ReactNode }) {
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

export const headingStyle = { color: '#111827', marginTop: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3 } as const
export const paragraphStyle = { color: '#374151', lineHeight: 1.6, fontSize: 14, margin: '0 0 12px' } as const
export const mutedStyle = { color: '#9ca3af', fontSize: 13, lineHeight: 1.5, margin: '24px 0 0' } as const

export const headingClass = 'e-text-heading'
export const paragraphClass = 'e-text-body'
export const mutedClass = 'e-text-muted'
