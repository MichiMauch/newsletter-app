import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { newsletterSubscribers, subscriberLists } from '@/lib/schema'
import { getMembershipsForSubscriber } from '@/lib/lists'
import PreferencesForm from '@/components/preferences/PreferencesForm'

export const dynamic = 'force-dynamic'

export default async function PreferencesPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = getDb()

  const subRows = await db.select({
    id: newsletterSubscribers.id,
    siteId: newsletterSubscribers.siteId,
    email: newsletterSubscribers.email,
    firstName: newsletterSubscribers.firstName,
    status: newsletterSubscribers.status,
    blockedAt: newsletterSubscribers.blockedAt,
  })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.token, token))
    .limit(1)
  const sub = subRows[0]
  if (!sub) return <ErrorBox title="Ungültiger Link" message="Dieser Link ist ungültig oder abgelaufen." />

  const [memberships, lists] = await Promise.all([
    getMembershipsForSubscriber(sub.id),
    db.select({
      id: subscriberLists.id,
      name: subscriberLists.name,
      slug: subscriberLists.slug,
      description: subscriberLists.description,
    })
      .from(subscriberLists)
      .where(eq(subscriberLists.siteId, sub.siteId))
      .orderBy(subscriberLists.name),
  ])

  if (sub.status === 'blocked') {
    return (
      <Wrap>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Du bist abgemeldet</h1>
        <p className="mt-2 text-[var(--foreground-secondary)]">
          Dein Konto ist seit {sub.blockedAt ? new Date(sub.blockedAt + 'Z').toLocaleString('de-CH') : 'einer Weile'} blockiert.
          Wenn du wieder Newsletter erhalten möchtest, melde dich bitte erneut über das Anmeldeformular an.
        </p>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <PreferencesForm
        token={token}
        initial={{
          email: sub.email,
          firstName: sub.firstName ?? '',
          memberships: memberships.map((m) => m.listId),
          lists: lists.map((l) => ({
            id: l.id,
            name: l.name,
            slug: l.slug,
            description: l.description ?? null,
          })),
        }}
      />
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-[var(--background)] px-4 py-12">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-[var(--background-card)] p-8 shadow-sm ring-1 ring-[var(--border-color)]">
        {children}
      </div>
    </div>
  )
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <Wrap>
      <h1 className="text-xl font-semibold text-[var(--foreground)]">{title}</h1>
      <p className="mt-2 text-[var(--foreground-secondary)]">{message}</p>
    </Wrap>
  )
}
