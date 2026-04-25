/**
 * Email sending via Resend — newsletter functions only
 * All branding is injected via SiteConfig
 */

import { Resend } from 'resend'
import type { SiteConfig } from './site-config'
import {
  renderNewsletterHtml,
  renderNewsletterText,
  renderMultiBlockHtml,
  renderMultiBlockText,
  renderConfirmationEmail,
  renderAlreadySubscribedEmail,
} from './newsletter-render'
import type { NewsletterBlock, PostRef } from './newsletter-blocks'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

function fromAddress(site: SiteConfig): string {
  return `${site.from_name} <${site.from_email}>`
}

// ─── Newsletter: Bestätigungs-E-Mail ──────────────────────────────────

export async function sendConfirmationEmail(site: SiteConfig, data: { email: string; token: string }) {
  const siteUrl = process.env.SITE_URL || site.site_url
  const confirmUrl = `${siteUrl}/newsletter/bestaetigen?token=${data.token}`

  try {
    const { html, text } = await renderConfirmationEmail({ site, confirmUrl })
    await getResend().emails.send({
      from: fromAddress(site),
      to: data.email,
      subject: `Bitte bestätige deine Newsletter-Anmeldung auf ${site.name}`,
      html,
      text,
    })
  } catch (err) {
    console.error('[notify] Failed to send confirmation email:', err)
  }
}

// ─── Newsletter: Bereits angemeldet ──────────────────────────────────

export async function sendAlreadySubscribedEmail(site: SiteConfig, data: { email: string }) {
  try {
    const { html, text } = await renderAlreadySubscribedEmail({ site })
    await getResend().emails.send({
      from: fromAddress(site),
      to: data.email,
      subject: `Du bist bereits für den ${site.name} Newsletter angemeldet`,
      html,
      text,
    })
  } catch (err) {
    console.error('[notify] Failed to send already-subscribed email:', err)
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

  const newsletterProps = {
    site,
    postTitle: data.postTitle,
    postUrl,
    postImage: data.postImage,
    postSummary: data.postSummary,
    postDate: data.postDate,
    unsubscribeUrl,
  }
  const [html, text] = await Promise.all([
    renderNewsletterHtml(newsletterProps),
    renderNewsletterText(newsletterProps),
  ])

  const result = await getResend().emails.send({
    from: fromAddress(site),
    to: data.email,
    subject: data.postTitle,
    html,
    text,
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
    scheduledAt?: string // ISO-8601, an Resend durchgereicht für Send-Time Optimization
  },
): Promise<{ resendEmailId: string | null }> {
  const siteUrl = process.env.SITE_URL || site.site_url
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${data.unsubscribeToken}`

  try {
    const props = {
      site,
      subject: data.subject,
      blocks: data.blocks,
      postsMap: data.postsMap,
      unsubscribeUrl,
    }
    const [html, text] = await Promise.all([
      renderMultiBlockHtml(props),
      renderMultiBlockText(props),
    ])

    const result = await getResend().emails.send({
      from: fromAddress(site),
      to: data.email,
      subject: data.subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      ...(data.scheduledAt ? { scheduledAt: data.scheduledAt } : {}),
    })

    return { resendEmailId: result.data?.id ?? null }
  } catch (err) {
    console.error(`[notify] Failed to send multi-block newsletter to ${data.email}:`, err)
    throw err
  }
}
