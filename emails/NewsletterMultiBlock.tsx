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
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import { escapeHtml, sanitizeColor, sanitizeFontFamily } from '@/lib/newsletter-template'
import { sanitizeHtml } from '@/lib/sanitize'
import { PREVIEW_SITE_CONFIG } from './_preview-data'
import { EmailHead } from './_layout'

export interface NewsletterMultiBlockProps {
  site: SiteConfig
  subject?: string
  preheader?: string | null
  blocks: NewsletterBlock[]
  postsMap: Record<string, PostRef>
  unsubscribeUrl: string
}

function cleanSlug(slug: string): string {
  return slug.replace(/\.md$/, '')
}

function postUrlFor(site: SiteConfig, post: PostRef): string {
  return `${site.site_url}/tiny-house/${cleanSlug(post.slug)}/`
}

function styleTiptapHtml(content: string): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  if (!isHtml) {
    const escaped = escapeHtml(content).replace(/\n/g, '<br />')
    return `<p style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0;">${escaped}</p>`
  }
  return sanitizeHtml(content)
    .replace(/<p>/g, '<p style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px;">')
    .replace(/<h2>/g, '<h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 12px;">')
    .replace(/<h3>/g, '<h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 10px;">')
    .replace(/<a /g, '<a style="color: #059669; text-decoration: underline;" ')
    .replace(/<ul>/g, '<ul style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px; padding-left: 20px;">')
    .replace(/<ol>/g, '<ol style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px; padding-left: 20px;">')
    .replace(/<li>/g, '<li style="margin: 0 0 4px;">')
    .replace(/<blockquote>/g, '<blockquote style="border-left: 3px solid #d1d5db; padding-left: 16px; margin: 0 0 12px; color: #6b7280; font-style: italic;">')
    .replace(/<hr\s*\/?>/g, '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">')
}

function HeroBlockView({ post, site, accentColor }: { post: PostRef; site: SiteConfig; accentColor: string }) {
  const url = postUrlFor(site, post)
  return (
    <>
      {post.image ? (
        <Img
          src={post.image}
          alt={post.title}
          width={600}
          style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
        />
      ) : null}
      <Section style={{ padding: '24px 32px 32px' }}>
        <Heading
          as="h2"
          className="e-text-heading"
          style={{ color: '#111827', margin: '0 0 16px', fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}
        >
          <Link href={url} className="e-text-heading" style={{ color: '#111827', textDecoration: 'none' }}>
            {post.title}
          </Link>
        </Heading>
        <Text className="e-text-body" style={{ color: '#374151', lineHeight: 1.6, fontSize: 14, margin: '0 0 24px' }}>
          {post.summary}
        </Text>
        <Section style={{ textAlign: 'center', margin: 0 }}>
          <Button
            href={url}
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
    </>
  )
}

function LinkListBlockView({
  posts,
  site,
  primaryColor,
  accentColor,
}: {
  posts: PostRef[]
  site: SiteConfig
  primaryColor: string
  accentColor: string
}) {
  if (posts.length === 0) return null
  return (
    <Section style={{ padding: '0 32px 32px' }}>
      {posts.map((post) => {
        const url = postUrlFor(site, post)
        return (
          <Section key={post.slug} className="e-divider" style={{ paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
            {post.image ? (
              <Link href={url}>
                <Img
                  src={post.image}
                  alt={post.title}
                  width={536}
                  style={{ width: '100%', height: 'auto', maxHeight: 200, objectFit: 'cover', display: 'block' }}
                />
              </Link>
            ) : null}
            <Section style={{ padding: '12px 0 16px' }}>
              <Link href={url} style={{ textDecoration: 'none' }}>
                <Text
                  style={{
                    color: primaryColor,
                    fontSize: 15,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    margin: 0,
                    display: 'block',
                  }}
                >
                  {post.title}
                </Text>
                <Text
                  className="e-text-body"
                  style={{
                    color: '#6b7280',
                    fontSize: 13,
                    lineHeight: 1.5,
                    margin: '4px 0 0',
                    display: 'block',
                  }}
                >
                  {post.summary}
                </Text>
                <Text
                  style={{
                    color: accentColor,
                    fontSize: 13,
                    fontWeight: 600,
                    margin: '8px 0 0',
                    display: 'inline-block',
                  }}
                >
                  Weiterlesen →
                </Text>
              </Link>
            </Section>
          </Section>
        )
      })}
    </Section>
  )
}

function TextBlockView({ content }: { content: string }) {
  return (
    <Section style={{ padding: '0 32px 32px' }}>
      <div dangerouslySetInnerHTML={{ __html: styleTiptapHtml(content) }} />
    </Section>
  )
}

function RecapHeaderBlockView({ label, accentColor }: { label: string; accentColor: string }) {
  return (
    <Section style={{ padding: '0 32px 24px' }}>
      <Hr
        className="e-divider"
        style={{ borderColor: '#e5e7eb', margin: '0 0 16px 0' }}
      />
      <Text
        style={{
          color: accentColor,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Section>
  )
}

function SocialLinksView({ site, accentColor }: { site: SiteConfig; accentColor: string }) {
  const entries = Object.entries(site.social_links).filter(([, url]) => url)
  if (entries.length === 0) return null
  return (
    <Text style={{ margin: '0 0 16px', fontSize: 13 }}>
      {entries.map(([label, url], idx) => (
        <span key={label}>
          {idx > 0 ? <span style={{ color: '#d1d5db', padding: '0 6px' }}>&middot;</span> : null}
          <Link href={url} style={{ color: accentColor, textDecoration: 'none', fontWeight: 500 }}>
            {label}
          </Link>
        </span>
      ))}
    </Text>
  )
}

export function NewsletterMultiBlock({
  site,
  subject,
  preheader,
  blocks,
  postsMap,
  unsubscribeUrl,
}: NewsletterMultiBlockProps) {
  const primaryColor = sanitizeColor(site.primary_color)
  const accentColor = sanitizeColor(site.accent_color)
  const gradientEnd = sanitizeColor(site.gradient_end)
  const fontFamily = `'${sanitizeFontFamily(site.font_family)}', system-ui, -apple-system, sans-serif`
  const hostname = new URL(site.site_url).hostname

  const renderable = blocks
    .map((block) => {
      switch (block.type) {
        case 'hero': {
          const post = postsMap[block.slug]
          if (!post) return null
          return { id: block.id, type: 'hero' as const, post }
        }
        case 'link-list': {
          const posts = block.slugs.map((s) => postsMap[s]).filter(Boolean)
          if (posts.length === 0) return null
          return { id: block.id, type: 'link-list' as const, posts }
        }
        case 'text':
          if (!block.content) return null
          return { id: block.id, type: 'text' as const, content: block.content }
        case 'recap_header':
          if (!block.label) return null
          return { id: block.id, type: 'recap_header' as const, label: block.label }
        case 'last_newsletter':
          return null
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  const firstIsHero = renderable.length > 0 && renderable[0].type === 'hero'

  return (
    <Html lang={site.locale.split('-')[0]}>
      <EmailHead />
      <Preview>{preheader || subject || site.name}</Preview>
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
          {/* Header */}
          <Section
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${gradientEnd})`,
              padding: '14px 32px',
              textAlign: 'center',
            }}
          >
            {site.logo_url ? (
              <Img
                src={site.logo_url}
                alt={site.name}
                width={32}
                height={32}
                style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 10 }}
              />
            ) : null}
            <Text
              style={{
                color: '#ffffff',
                fontSize: 18,
                fontWeight: 600,
                verticalAlign: 'middle',
                display: 'inline',
                margin: 0,
              }}
            >
              {site.name}
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ padding: firstIsHero ? 0 : '24px 0 0' }}>
            {renderable.map((b, idx) => {
              const prev = renderable[idx - 1]
              const showAutoDivider =
                idx > 0 && b.type !== 'recap_header' && prev?.type !== 'recap_header'
              return (
              <Section key={b.id}>
                {showAutoDivider ? (
                  <Section style={{ padding: '0 32px' }}>
                    <Hr className="e-divider" style={{ borderColor: '#e5e7eb', margin: '0 0 32px 0' }} />
                  </Section>
                ) : null}
                {b.type === 'hero' ? (
                  <HeroBlockView post={b.post} site={site} accentColor={accentColor} />
                ) : b.type === 'link-list' ? (
                  <LinkListBlockView
                    posts={b.posts}
                    site={site}
                    primaryColor={primaryColor}
                    accentColor={accentColor}
                  />
                ) : b.type === 'recap_header' ? (
                  <RecapHeaderBlockView label={b.label} accentColor={accentColor} />
                ) : (
                  <TextBlockView content={b.content} />
                )}
              </Section>
              )
            })}
          </Section>

          {/* Footer */}
          <Section
            className="e-footer"
            style={{
              background: '#f9fafb',
              padding: '24px 32px',
              borderTop: '1px solid #e5e7eb',
              textAlign: 'center',
            }}
          >
            <SocialLinksView site={site} accentColor={accentColor} />
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

const PREVIEW_POST_A: PostRef = {
  slug: 'bau-tagebuch',
  title: 'Wie wir unser Tiny House gebaut haben',
  summary:
    'Ein Erfahrungsbericht über zwölf Monate Bau — von der ersten Skizze bis zum Einzug.',
  image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
  date: '2026-04-20',
}

const PREVIEW_POST_B: PostRef = {
  slug: 'kosten-uebersicht',
  title: 'Was hat es wirklich gekostet?',
  summary: 'Volle Kostentransparenz mit Excel-Aufschlüsselung — Material, Handwerker, Behörden.',
  image: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800',
  date: '2026-04-12',
}

const PREVIEW_POST_C: PostRef = {
  slug: 'autark-leben',
  title: 'Wie wir autark wohnen',
  summary: 'Solarstrom, Regenwasser, Komposttoilette — was funktioniert, was nicht.',
  image: null,
  date: '2026-04-05',
}

NewsletterMultiBlock.PreviewProps = {
  site: PREVIEW_SITE_CONFIG,
  subject: 'Tiny-House-News: Bau-Tagebuch + Kostenübersicht',
  preheader: 'Wie wir in zwölf Monaten gebaut haben — und was es wirklich gekostet hat.',
  blocks: [
    { id: '1', type: 'hero', slug: 'bau-tagebuch' },
    {
      id: '2',
      type: 'text',
      content:
        '<p>Diese Woche teilen wir zwei Beiträge mit dir — ein detailliertes Bau-Tagebuch und eine ehrliche Kostenaufstellung. Viel Spass beim Lesen!</p>',
    },
    { id: 'recap-1', type: 'recap_header', label: 'Das war unser letzter Newsletter' },
    { id: '3', type: 'link-list', slugs: ['kosten-uebersicht', 'autark-leben'] },
  ],
  postsMap: {
    'bau-tagebuch': PREVIEW_POST_A,
    'kosten-uebersicht': PREVIEW_POST_B,
    'autark-leben': PREVIEW_POST_C,
  },
  unsubscribeUrl: 'https://preview.localhost/unsubscribe?token=preview-token',
} satisfies NewsletterMultiBlockProps

export default NewsletterMultiBlock
