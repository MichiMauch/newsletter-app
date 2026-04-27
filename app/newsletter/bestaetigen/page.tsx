import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  confirmSubscriber,
  confirmSubscriberByEmail,
  getLastSendWithBlocks,
  getSubscriberByToken,
  type ComplianceContext,
} from '@/lib/newsletter'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { enrollSubscriber } from '@/lib/automation'
import { getContentItemsBySlugs } from '@/lib/content'
import { getSiteConfig } from '@/lib/site-config'
import { verifyConfirmToken } from '@/lib/confirm-token'
import { getClientIpFromHeaders } from '@/lib/rate-limit'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { newsletterSubscribers } from '@/lib/schema'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'

interface ResolvedSubscriber {
  email: string
  token: string
  site_id: string
}

// Mit HMAC-Confirm-Token kennen wir nur (siteId, email). Wir brauchen aber
// noch den stabilen Unsub-Token aus der DB für die Welcome-Mail-Footer.
async function getSubscriberBySiteAndEmail(siteId: string, email: string): Promise<ResolvedSubscriber | null> {
  const db = getDb()
  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      token: newsletterSubscribers.token,
      siteId: newsletterSubscribers.siteId,
    })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.siteId, siteId),
      eq(newsletterSubscribers.email, email.trim().toLowerCase()),
    ))
    .limit(1)
  if (!rows[0]) return null
  return { email: rows[0].email, token: rows[0].token, site_id: rows[0].siteId }
}

async function resolveAndConfirm(rawToken: string, ctx: ComplianceContext): Promise<ResolvedSubscriber | null> {
  // 1) HMAC-signed confirm token (current path)
  const verify = verifyConfirmToken(rawToken)
  if (verify.ok) {
    const flipped = await confirmSubscriberByEmail(verify.siteId, verify.email, ctx)
    if (!flipped) return null
    return await getSubscriberBySiteAndEmail(verify.siteId, verify.email)
  }

  // 2) Backward-compat: legacy DB-stored UUID token. Confirmation mails sent
  //    before the HMAC switch have these in flight; old links must keep working
  //    until pending-TTL (14d) has flushed them out.
  const flipped = await confirmSubscriber(rawToken, ctx)
  if (!flipped) return null
  const subscriber = await getSubscriberByToken(rawToken)
  if (!subscriber) return null
  return subscriber
}

export default async function BestaetigungPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorMessage />
  }

  const h = await headers()
  const complianceCtx: ComplianceContext = {
    ip: getClientIpFromHeaders((name) => h.get(name)),
    userAgent: h.get('user-agent'),
  }

  const subscriber = await resolveAndConfirm(token, complianceCtx)
  if (!subscriber) {
    return <ErrorMessage />
  }

  const siteId = subscriber.site_id
  const site = await getSiteConfig(siteId)

  // Send welcome email with last newsletter
  const lastSend = await getLastSendWithBlocks(siteId)
  if (lastSend) {
    try {
      const blocks: NewsletterBlock[] = JSON.parse(lastSend.blocks_json)
      const slugs = new Set<string>()
      for (const block of blocks) {
        if (block.type === 'hero') slugs.add(block.slug)
        if (block.type === 'link-list') block.slugs.forEach((s) => slugs.add(s))
      }

      const postsMap = await getContentItemsBySlugs(siteId, [...slugs])

      if (Object.keys(postsMap).length === 0) {
        console.warn(`[bestaetigen] postsMap empty for slugs: ${[...slugs].join(', ')} (siteId=${siteId})`)
      }

      // Prepend welcome text block
      const welcomeBlocks: NewsletterBlock[] = [
        { id: 'welcome', type: 'text', content: `Willkommen bei ${site.name}! 🎉\n\nSchön, dass du dabei bist. Hier ist unser letzter Newsletter:` },
        ...blocks,
      ]

      await sendMultiBlockNewsletterEmail(site, {
        email: subscriber.email,
        unsubscribeToken: subscriber.token,
        subject: `Willkommen bei ${site.name} 🏠`,
        blocks: welcomeBlocks,
        postsMap,
      })
    } catch (err) {
      console.error('[bestaetigen] Failed to send welcome email:', err)
    }
  }

  // Enroll in active automations
  await enrollSubscriber(siteId, subscriber.email, 'subscriber_confirmed')

  // The token rides along so the welcome page can offer the optional
  // first-name capture form. Same token used in the unsubscribe footer —
  // see security note in lib/newsletter-subscribers.ts:updateFirstName.
  const params = new URLSearchParams({
    site: site.site_url,
    token: subscriber.token,
  })
  redirect(`/newsletter/bestaetigt?${params.toString()}`)
}

function ErrorMessage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="mx-auto max-w-md rounded-2xl bg-[var(--background-card)] p-8 text-center shadow-sm ring-1 ring-[var(--border-color)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg className="h-7 w-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-[var(--foreground)]">Ungültiger Link</h1>
        <p className="mt-2 text-[var(--foreground-secondary)]">
          Dieser Bestätigungslink ist ungültig oder bereits abgelaufen.
        </p>
      </div>
    </div>
  )
}
