/**
 * Email sending via Resend — newsletter functions only
 * All branding is injected via SiteConfig
 */

import * as Sentry from '@sentry/nextjs'
import { getResendClient } from './resend-client'
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

function getResend() {
  return getResendClient()
}

function fromAddress(site: SiteConfig): string {
  return `${site.from_name} <${site.from_email}>`
}

function siteUrlOf(site: SiteConfig): string {
  return process.env.SITE_URL || site.site_url
}

// Browser-Page für menschliche Klicks (gestylte Bestätigung)
function unsubscribePageUrl(site: SiteConfig, token: string): string {
  return `${siteUrlOf(site)}/unsubscribe?token=${token}`
}

// One-Click-Endpoint für den List-Unsubscribe-Header (POST + GET)
function unsubscribeOneClickUrl(site: SiteConfig, token: string): string {
  return `${siteUrlOf(site)}/api/v1/unsubscribe?token=${token}`
}

function listUnsubscribeHeaders(site: SiteConfig, token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeOneClickUrl(site, token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

// ─── Storno einer geplanten Resend-Email ─────────────────────────────
// Funktioniert nur, solange Resend die Mail noch nicht abgesendet hat.
// Wirft nicht — Aufrufer entscheidet, was bei Fehler passiert.
export async function cancelResendEmail(resendEmailId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await getResend().emails.cancel(resendEmailId)
    if (result.error) {
      return { ok: false, error: result.error.message }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

// ─── Newsletter: Bestätigungs-E-Mail ──────────────────────────────────

export async function sendConfirmationEmail(site: SiteConfig, data: { email: string; token: string }) {
  const confirmUrl = `${siteUrlOf(site)}/newsletter/bestaetigen?token=${data.token}`

  try {
    const { html, text } = await renderConfirmationEmail({ site, confirmUrl })
    const result = await getResend().emails.send(
      {
        from: fromAddress(site),
        to: data.email,
        subject: `Bitte bestätige deine Newsletter-Anmeldung auf ${site.name}`,
        html,
        text,
        headers: listUnsubscribeHeaders(site, data.token),
      },
      { idempotencyKey: `confirm:${data.token}` },
    )
    if (result.error) {
      throw new Error(`Resend: ${result.error.message}`)
    }
  } catch (err) {
    console.error('[notify] Failed to send confirmation email:', err)
    Sentry.captureException(err, { tags: { area: 'notify', kind: 'confirmation' } })
  }
}

// ─── Newsletter: Bereits angemeldet ──────────────────────────────────

export async function sendAlreadySubscribedEmail(site: SiteConfig, data: { email: string; token: string }) {
  try {
    const unsubscribeUrl = unsubscribePageUrl(site, data.token)
    const { html, text } = await renderAlreadySubscribedEmail({ site, unsubscribeUrl })
    const result = await getResend().emails.send(
      {
        from: fromAddress(site),
        to: data.email,
        subject: `Du bist bereits für den ${site.name} Newsletter angemeldet`,
        html,
        text,
        headers: listUnsubscribeHeaders(site, data.token),
      },
      { idempotencyKey: `already:${data.token}` },
    )
    if (result.error) {
      throw new Error(`Resend: ${result.error.message}`)
    }
  } catch (err) {
    console.error('[notify] Failed to send already-subscribed email:', err)
    Sentry.captureException(err, { tags: { area: 'notify', kind: 'already-subscribed' } })
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
  const unsubscribeUrl = unsubscribePageUrl(site, data.unsubscribeToken)

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

  const result = await getResend().emails.send(
    {
      from: fromAddress(site),
      to: data.email,
      subject: data.postTitle,
      html,
      text,
      headers: listUnsubscribeHeaders(site, data.unsubscribeToken),
    },
    { idempotencyKey: `nl-single:${slug}:${data.unsubscribeToken}` },
  )

  if (result.error) {
    throw new Error(`Resend: ${result.error.message}`)
  }

  return { resendEmailId: result.data?.id ?? null }
}

// ─── Newsletter: Multi-Block ────────────────────────────────────

export async function sendMultiBlockNewsletterEmail(
  site: SiteConfig,
  data: {
    email: string
    unsubscribeToken: string
    subject: string
    preheader?: string | null
    blocks: NewsletterBlock[]
    postsMap: Record<string, PostRef>
    scheduledAt?: string // ISO-8601, an Resend durchgereicht für Send-Time Optimization
    sendId?: number // für deterministischen idempotencyKey beim Newsletter-Versand
  },
): Promise<{ resendEmailId: string | null }> {
  const unsubscribeUrl = unsubscribePageUrl(site, data.unsubscribeToken)

  try {
    const props = {
      site,
      subject: data.subject,
      preheader: data.preheader ?? null,
      blocks: data.blocks,
      postsMap: data.postsMap,
      unsubscribeUrl,
    }
    const [html, text] = await Promise.all([
      renderMultiBlockHtml(props),
      renderMultiBlockText(props),
    ])

    // Test-Sends nutzen Token "test" — kein deterministischer Key,
    // sonst gibt Resend bei mehreren Test-Sends im 24h-Fenster die alte Mail zurück.
    const idempotencyKey =
      data.sendId !== undefined && data.unsubscribeToken !== 'test'
        ? `nl-multi:${data.sendId}:${data.email}`
        : undefined

    const result = await getResend().emails.send(
      {
        from: fromAddress(site),
        to: data.email,
        subject: data.subject,
        html,
        text,
        headers: listUnsubscribeHeaders(site, data.unsubscribeToken),
        ...(data.scheduledAt ? { scheduledAt: data.scheduledAt } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    )

    if (result.error) {
      throw new Error(`Resend: ${result.error.message}`)
    }

    return { resendEmailId: result.data?.id ?? null }
  } catch (err) {
    console.error(`[notify] Failed to send multi-block newsletter to ${data.email}:`, err)
    Sentry.captureException(err, {
      tags: { area: 'notify', kind: 'newsletter-multi' },
      extra: { sendId: data.sendId, recipient: data.email },
    })
    throw err
  }
}
