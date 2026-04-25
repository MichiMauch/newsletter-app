import {
  Body,
  Button,
  Container,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { SiteConfig } from '@/lib/site-config'
import { sanitizeColor, sanitizeFontFamily } from '@/lib/newsletter-template'
import { PREVIEW_SITE_CONFIG } from './_preview-data'
import { EmailHead } from './_layout'

export interface NewsletterProps {
  site: SiteConfig
  postTitle: string
  postUrl: string
  postImage: string | null
  postSummary: string
  postDate: string
  unsubscribeUrl: string
}

export function Newsletter({
  site,
  postTitle,
  postUrl,
  postImage,
  postSummary,
  postDate,
  unsubscribeUrl,
}: NewsletterProps) {
  const primaryColor = sanitizeColor(site.primary_color)
  const accentColor = sanitizeColor(site.accent_color)
  const gradientEnd = sanitizeColor(site.gradient_end)
  const fontFamily = `'${sanitizeFontFamily(site.font_family)}', system-ui, -apple-system, sans-serif`

  const formattedDate = new Date(postDate).toLocaleDateString(site.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const hostname = new URL(site.site_url).hostname

  return (
    <Html lang={site.locale.split('-')[0]}>
      <EmailHead />
      <Preview>{postTitle}</Preview>
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
          {postImage ? (
            <Section>
              <Img
                src={postImage}
                alt={postTitle}
                width={600}
                style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
              />
            </Section>
          ) : (
            <Section
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${gradientEnd})`,
                padding: 32,
                textAlign: 'center',
              }}
            >
              {site.logo_url ? (
                <Img
                  src={site.logo_url}
                  alt={site.name}
                  width={48}
                  height={48}
                  style={{ display: 'inline-block' }}
                />
              ) : null}
              <Heading
                as="h1"
                style={{ color: '#ffffff', margin: '8px 0 0', fontSize: 20, fontWeight: 600 }}
              >
                {site.name}
              </Heading>
            </Section>
          )}

          <Section style={{ padding: 32 }}>
            <Text
              style={{
                color: accentColor,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 12px',
              }}
            >
              {formattedDate}
            </Text>
            <Heading
              as="h2"
              className="e-text-heading"
              style={{
                color: '#111827',
                margin: '0 0 16px',
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              {postTitle}
            </Heading>
            <Text
              className="e-text-body"
              style={{
                color: '#374151',
                lineHeight: 1.6,
                fontSize: 14,
                margin: '0 0 28px',
              }}
            >
              {postSummary}
            </Text>
            <Section style={{ textAlign: 'center', margin: '0 0 32px' }}>
              <Button
                href={postUrl}
                style={{
                  display: 'inline-block',
                  background: accentColor,
                  color: '#ffffff',
                  padding: '14px 36px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Weiterlesen
              </Button>
            </Section>
          </Section>

          <Hr className="e-divider" style={{ borderColor: '#e5e7eb', margin: 0 }} />
          <Section
            className="e-footer"
            style={{
              background: '#f9fafb',
              padding: '20px 32px',
              textAlign: 'center',
            }}
          >
            {site.footer_text ? (
              <Text className="e-text-muted" style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
                {site.footer_text}
              </Text>
            ) : (
              <Text className="e-text-muted" style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
                Du erhältst diesen Newsletter, weil du dich auf{' '}
                <Link href={site.site_url} style={{ color: accentColor, textDecoration: 'none' }}>
                  {hostname}
                </Link>{' '}
                angemeldet hast.
              </Text>
            )}
            <Text style={{ margin: 0 }}>
              <Link
                href={unsubscribeUrl}
                className="e-link-muted"
                style={{ color: '#9ca3af', fontSize: 12, textDecoration: 'underline' }}
              >
                Newsletter abbestellen
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

Newsletter.PreviewProps = {
  site: PREVIEW_SITE_CONFIG,
  postTitle: 'Wie wir unser Tiny House gebaut haben',
  postUrl: 'https://preview.localhost/tiny-house/bau-tagebuch/',
  postImage: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
  postSummary:
    'Ein Erfahrungsbericht über zwölf Monate Tiny-House-Bau — von der ersten Skizze bis zum Einzug. Mit allen Stolpersteinen, Kosten und Lessons Learned.',
  postDate: '2026-04-20',
  unsubscribeUrl: 'https://preview.localhost/unsubscribe?token=preview-token',
} satisfies NewsletterProps

export default Newsletter
