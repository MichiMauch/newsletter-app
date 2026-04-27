import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  sanitizeColor,
  sanitizeFontFamily,
  buildMultiBlockNewsletterHtml,
} from '@/lib/newsletter-template'
import type { SiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'

const SITE: SiteConfig = {
  id: 'kokomo',
  name: 'Kokomo',
  site_url: 'https://example.com',
  logo_url: null,
  primary_color: '#017734',
  accent_color: '#05DE66',
  gradient_end: '#01ABE7',
  font_family: 'Poppins',
  from_email: 'a@b.c',
  from_name: 'A',
  footer_text: null,
  social_links: {},
  allowed_origin: 'https://example.com',
  turnstile_site_key: null,
  locale: 'de-CH',
}

const POST: PostRef = {
  slug: 'hello',
  title: 'Hello',
  summary: 'Sum',
  image: null,
  date: '2026-04-01',
}

describe('escapeHtml', () => {
  it('escapes &, <, >, "', () => {
    expect(escapeHtml('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;')
  })
})

describe('sanitizeColor', () => {
  it('passes valid hex colors through', () => {
    expect(sanitizeColor('#017734')).toBe('#017734')
    expect(sanitizeColor('#fff')).toBe('#fff')
  })

  it('passes simple named colors', () => {
    expect(sanitizeColor('red')).toBe('red')
  })

  it('falls back to black on injection attempts', () => {
    expect(sanitizeColor('red; background:url(evil)')).toBe('#000000')
    expect(sanitizeColor('javascript:1')).toBe('#000000')
  })
})

describe('sanitizeFontFamily', () => {
  it('strips quotes, semicolons, brackets', () => {
    expect(sanitizeFontFamily('Poppins')).toBe('Poppins')
    expect(sanitizeFontFamily('Poppins"; background:red;')).toBe('Poppins background:red')
    expect(sanitizeFontFamily("''")).toBe('system-ui')
  })

  it('falls back to system-ui on empty input', () => {
    expect(sanitizeFontFamily('')).toBe('system-ui')
  })
})

describe('buildMultiBlockNewsletterHtml', () => {
  const blocks: NewsletterBlock[] = [{ id: 'h', type: 'hero', slug: 'hello' }]
  const postsMap: Record<string, PostRef> = { hello: POST }

  it('renders hero block with site branding', () => {
    const html = buildMultiBlockNewsletterHtml(SITE, blocks, postsMap, 'https://x/u?t=1')
    expect(html).toContain('Hello')
    expect(html).toContain('https://example.com/tiny-house/hello/')
    expect(html).toContain('Newsletter abbestellen')
    expect(html).toContain('https://x/u?t=1')
  })

  it('omits preheader markup when not provided', () => {
    const html = buildMultiBlockNewsletterHtml(SITE, blocks, postsMap, '#')
    expect(html).not.toMatch(/display:none[^>]*>[^<]+<\/div>/)
  })

  it('renders hidden preheader markup when provided', () => {
    const html = buildMultiBlockNewsletterHtml(SITE, blocks, postsMap, '#', 'Vorschau-Text')
    expect(html).toMatch(/display:none[^>]*>Vorschau-Text<\/div>/)
  })

  it('escapes preheader content', () => {
    const html = buildMultiBlockNewsletterHtml(SITE, blocks, postsMap, '#', '<script>x</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('treats whitespace-only preheader as empty', () => {
    const html = buildMultiBlockNewsletterHtml(SITE, blocks, postsMap, '#', '   ')
    expect(html).not.toContain('display:none')
  })
})
