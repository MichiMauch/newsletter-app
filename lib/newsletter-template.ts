/**
 * Newsletter HTML template builder
 * Pure function — usable on both server and client
 * All branding is injected via SiteConfig
 */

import type { SiteConfig } from './site-config'
import type { NewsletterBlock, PostRef } from './newsletter-blocks'
import { sanitizeHtml } from './sanitize'

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Strip everything except hex colors (e.g. #017734) and named CSS colors */
export function sanitizeColor(value: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  if (/^[a-zA-Z]{1,30}$/.test(trimmed)) return trimmed
  return '#000000'
}

/** Strip quotes, semicolons, and angle brackets from font family names */
export function sanitizeFontFamily(value: string): string {
  return value.replace(/['";<>{}()\\]/g, '').trim() || 'system-ui'
}

/** Return a copy of the SiteConfig with CSS-safe values */
function safeSiteStyles(site: SiteConfig) {
  return {
    primaryColor: sanitizeColor(site.primary_color),
    accentColor: sanitizeColor(site.accent_color),
    gradientEnd: sanitizeColor(site.gradient_end),
    fontFamily: sanitizeFontFamily(site.font_family),
  }
}

function cleanSlug(slug: string): string {
  return slug.replace(/\.md$/, '')
}

// ─── Multi-Block Newsletter ──────────────────────────────────────────

function renderHeroBlock(post: PostRef, site: SiteConfig): string {
  const s = safeSiteStyles(site)
  const postUrl = `${site.site_url}/tiny-house/${cleanSlug(post.slug)}/`
  const imageHtml = post.image
    ? `<tr><td><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" width="600" style="width: 100%; display: block; max-height: 320px; object-fit: cover;" /></td></tr>`
    : ''

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${imageHtml}
      <tr>
        <td style="padding: 24px 32px 32px 32px;">
          <h2 style="color: #111827; margin: 0 0 16px; font-size: 22px; font-weight: 700; line-height: 1.3;">
            <a href="${escapeHtml(postUrl)}" style="color: #111827; text-decoration: none;">${escapeHtml(post.title)}</a>
          </h2>
          <p style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 24px;">
            ${escapeHtml(post.summary)}
          </p>
          <p style="text-align: center; margin: 0;">
            <a href="${escapeHtml(postUrl)}" style="display: inline-block; background: ${s.accentColor}; color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Weiterlesen
            </a>
          </p>
        </td>
      </tr>
    </table>
  `
}

function renderLinkListBlock(posts: PostRef[], site: SiteConfig): string {
  if (posts.length === 0) return ''
  const s = safeSiteStyles(site)

  const rows = posts
    .map((post) => {
      const postUrl = `${site.site_url}/tiny-house/${cleanSlug(post.slug)}/`
      const imageHtml = post.image
        ? `<tr>
            <td>
              <a href="${escapeHtml(postUrl)}">
                <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" width="536" style="width: 100%; height: auto; max-height: 200px; object-fit: cover; display: block;" />
              </a>
            </td>
          </tr>`
        : ''

      return `
        <tr>
          <td style="padding: 0 0 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom: 1px solid #f3f4f6;">
              ${imageHtml}
              <tr>
                <td style="padding: 12px 0 16px 0;">
                  <a href="${escapeHtml(postUrl)}" style="text-decoration: none;">
                    <span style="color: ${s.primaryColor}; font-size: 15px; font-weight: 600; line-height: 1.4; display: block;">
                      ${escapeHtml(post.title)}
                    </span>
                    <span style="color: #6b7280; font-size: 13px; line-height: 1.5; display: block; margin-top: 4px;">
                      ${escapeHtml(post.summary)}
                    </span>
                    <span style="color: ${s.accentColor}; font-size: 13px; font-weight: 600; display: inline-block; margin-top: 8px;">
                      Weiterlesen →
                    </span>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    })
    .join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding: 0 32px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  `
}

function renderTextBlock(content: string): string {
  // Detect if content is HTML (from tiptap) or plain text (legacy)
  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  let htmlContent: string

  if (isHtml) {
    // Sanitize first, then apply inline email-safe styles
    htmlContent = sanitizeHtml(content)
      .replace(/<p>/g, '<p style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px;">')
      .replace(/<h2>/g, '<h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 12px;">')
      .replace(/<h3>/g, '<h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 10px;">')
      .replace(/<a /g, '<a style="color: #059669; text-decoration: underline;" ')
      .replace(/<ul>/g, '<ul style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px; padding-left: 20px;">')
      .replace(/<ol>/g, '<ol style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0 0 12px; padding-left: 20px;">')
      .replace(/<li>/g, '<li style="margin: 0 0 4px;">')
      .replace(/<blockquote>/g, '<blockquote style="border-left: 3px solid #d1d5db; padding-left: 16px; margin: 0 0 12px; color: #6b7280; font-style: italic;">')
      .replace(/<hr\s*\/?>/g, '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">')
  } else {
    // Legacy plain text
    htmlContent = escapeHtml(content).replace(/\n/g, '<br />')
    htmlContent = `<p style="color: #374151; line-height: 1.6; font-size: 14px; margin: 0;">${htmlContent}</p>`
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding: 0 32px 32px 32px;">
          ${htmlContent}
        </td>
      </tr>
    </table>
  `
}

function renderSocialLinks(site: SiteConfig): string {
  const links = site.social_links
  const entries = Object.entries(links).filter(([, url]) => url)
  if (entries.length === 0) return ''
  const s = safeSiteStyles(site)

  const linkHtml = entries
    .map(([label, url]) => `<a href="${escapeHtml(url)}" style="color: ${s.accentColor}; text-decoration: none; font-weight: 500;">${escapeHtml(label)}</a>`)
    .join('<span style="color: #d1d5db; padding: 0 6px;">&middot;</span>')

  return `<p style="margin: 0 0 16px; font-size: 13px;">${linkHtml}</p>`
}

function renderSeparator(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding: 0 32px;">
          <div style="border-top: 1px solid #e5e7eb; margin: 0 0 32px 0;"></div>
        </td>
      </tr>
    </table>
  `
}

export function buildMultiBlockNewsletterHtml(
  site: SiteConfig,
  blocks: NewsletterBlock[],
  postsMap: Record<string, PostRef>,
  unsubscribeUrl: string,
): string {
  const renderedBlocks = blocks
    .map((block) => {
      switch (block.type) {
        case 'hero': {
          const post = postsMap[block.slug]
          return post ? renderHeroBlock(post, site) : ''
        }
        case 'link-list': {
          const posts = block.slugs.map((s) => postsMap[s]).filter(Boolean)
          return posts.length > 0 ? renderLinkListBlock(posts, site) : ''
        }
        case 'text':
          return block.content ? renderTextBlock(block.content) : ''
      }
    })
    .filter(Boolean)

  const s = safeSiteStyles(site)
  const blocksHtml = renderedBlocks.join(renderSeparator())
  const firstBlockIsHero = blocks.length > 0 && blocks[0].type === 'hero'
  const contentPadding = firstBlockIsHero ? 'padding: 0;' : 'padding: 24px 0 0;'
  const hostname = new URL(site.site_url).hostname

  return `
    <table width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="table-layout: fixed; font-family: '${s.fontFamily}', system-ui, -apple-system, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
      <tr>
        <td style="background: linear-gradient(135deg, ${s.primaryColor}, ${s.gradientEnd}); padding: 14px 32px; text-align: center;">
          ${site.logo_url ? `<img src="${escapeHtml(site.logo_url)}" alt="${escapeHtml(site.name)}" width="32" height="32" style="display: inline; width: 32px; height: 32px; vertical-align: middle; margin-right: 10px;" />` : ''}<span style="color: white; font-size: 18px; font-weight: 600; vertical-align: middle;">${escapeHtml(site.name)}</span>
        </td>
      </tr>
      <tr>
        <td style="${contentPadding}">
          ${blocksHtml}
        </td>
      </tr>
      <tr>
        <td style="background: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
          ${renderSocialLinks(site)}
          <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px;">
            ${site.footer_text ? escapeHtml(site.footer_text) : `Du erhältst diesen Newsletter, weil du dich auf <a href="${escapeHtml(site.site_url)}" style="color: ${s.accentColor}; text-decoration: none;">${escapeHtml(hostname)}</a> angemeldet hast.`}
          </p>
          <p style="margin: 0;">
            <a href="${escapeHtml(unsubscribeUrl)}" style="color: #9ca3af; font-size: 12px; text-decoration: underline;">Newsletter abbestellen</a>
          </p>
        </td>
      </tr>
    </table>
  `
}
