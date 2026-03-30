import { redirect } from 'next/navigation'
import { confirmSubscriber, getLastSendWithBlocks, getSubscriberByToken } from '@/lib/newsletter'
import { sendMultiBlockNewsletterEmail } from '@/lib/notify'
import { enrollSubscriber } from '@/lib/automation'
import { getContentItemsBySlugs } from '@/lib/content'
import { getSiteConfig } from '@/lib/site-config'
import type { NewsletterBlock } from '@/lib/newsletter-blocks'

export default async function BestaetigungPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorMessage />
  }

  const confirmed = await confirmSubscriber(token)
  if (!confirmed) {
    return <ErrorMessage />
  }

  // Get subscriber info
  const subscriber = await getSubscriberByToken(token)
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

  redirect('/newsletter/bestaetigt')
}

function ErrorMessage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-2xl">😕</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Ungültiger Link</h1>
        <p className="mt-2 text-gray-600">
          Dieser Bestätigungslink ist ungültig oder bereits abgelaufen.
        </p>
      </div>
    </div>
  )
}
