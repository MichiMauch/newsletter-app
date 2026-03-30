/**
 * Email sending via Resend — newsletter functions only
 * All branding is injected via SiteConfig
 */

import { Resend } from 'resend'
import type { SiteConfig } from './site-config'
import { buildNewsletterHtml, buildMultiBlockNewsletterHtml, escapeHtml } from './newsletter-template'
import type { NewsletterBlock, PostRef } from './newsletter-blocks'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

function fromAddress(site: SiteConfig): string {
  return `${site.from_name} <${site.from_email}>`
}

function emailWrapper(site: SiteConfig, content: string): string {
  const hostname = new URL(site.site_url).hostname
  return `
    <div style="font-family: '${site.font_family}', system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, ${site.primary_color}, ${site.gradient_end}); padding: 24px 32px; text-align: center;">
        ${site.logo_url ? `<img src="${escapeHtml(site.logo_url)}" alt="${escapeHtml(site.name)}" width="48" height="48" style="margin-bottom: 8px;" />` : ''}
        <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 600;">${escapeHtml(site.name)}</h1>
      </div>
      <div style="padding: 32px;">
        ${content}
      </div>
      <div style="background: #f9fafb; padding: 16px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Diese E-Mail wurde automatisch von <a href="${escapeHtml(site.site_url)}" style="color: ${site.accent_color}; text-decoration: none;">${escapeHtml(hostname)}</a> gesendet.
        </p>
      </div>
    </div>
  `
}

// ─── Newsletter: Bestätigungs-E-Mail ──────────────────────────────────

export async function sendConfirmationEmail(site: SiteConfig, data: { email: string; token: string }) {
  const siteUrl = process.env.SITE_URL || site.site_url
  const confirmUrl = `${siteUrl}/newsletter/bestaetigen?token=${data.token}`

  try {
    await getResend().emails.send({
      from: fromAddress(site),
      to: data.email,
      subject: `Bitte bestätige deine Newsletter-Anmeldung auf ${site.name}`,
      html: emailWrapper(site, `
        <h2 style="color: #111827; margin-top: 0;">Fast geschafft!</h2>
        <p style="color: #374151; line-height: 1.6;">
          Du hast dich für den ${escapeHtml(site.name)} Newsletter angemeldet.
          Bitte bestätige deine E-Mail-Adresse, damit wir dir künftig
          direkt schreiben können.
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${confirmUrl}" style="display: inline-block; background: ${site.accent_color}; color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Anmeldung bestätigen
          </a>
        </p>
        <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
          Wenn du dich nicht angemeldet hast, kannst du diese E-Mail einfach ignorieren.
        </p>
      `),
    })
  } catch (err) {
    console.error('[notify] Failed to send confirmation email:', err)
  }
}

// ─── Newsletter: Einzelner Post ────────────────────────────────────

export async function sendNewsletterEmail(
  site: SiteConfig,
  data: {
    email: string
    unsubscribeToken: string
    postTitle: string
    postSlug: string
    postImage: string | null
    postSummary: string
    postDate: string
  },
): Promise<{ resendEmailId: string | null }> {
  const slug = data.postSlug.replace(/\.md$/, '')
  const postUrl = `${site.site_url}/tiny-house/${slug}/`
  const siteUrl = process.env.SITE_URL || site.site_url
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${data.unsubscribeToken}`

  const result = await getResend().emails.send({
    from: fromAddress(site),
    to: data.email,
    subject: data.postTitle,
    html: buildNewsletterHtml(site, {
      postTitle: data.postTitle,
      postUrl,
      postImage: data.postImage,
      postSummary: data.postSummary,
      postDate: data.postDate,
      unsubscribeUrl,
    }),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  return { resendEmailId: result.data?.id ?? null }
}

// ─── Newsletter: Multi-Block ────────────────────────────────────

export async function sendMultiBlockNewsletterEmail(
  site: SiteConfig,
  data: {
    email: string
    unsubscribeToken: string
    subject: string
    blocks: NewsletterBlock[]
    postsMap: Record<string, PostRef>
  },
): Promise<{ resendEmailId: string | null }> {
  const siteUrl = process.env.SITE_URL || site.site_url
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${data.unsubscribeToken}`

  try {
    const result = await getResend().emails.send({
      from: fromAddress(site),
      to: data.email,
      subject: data.subject,
      html: buildMultiBlockNewsletterHtml(site, data.blocks, data.postsMap, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })

    return { resendEmailId: result.data?.id ?? null }
  } catch (err) {
    console.error(`[notify] Failed to send multi-block newsletter to ${data.email}:`, err)
    throw err
  }
}
