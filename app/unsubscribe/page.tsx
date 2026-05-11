import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { newsletterSubscribers } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { getSubscriberByToken, blockSubscriberCompletely } from '@/lib/newsletter'
import { cancelEnrollments } from '@/lib/automation'
import { removeMemberByToken, getMembershipsForSubscriber } from '@/lib/lists'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) return <ErrorMessage />

  // 1) List-Member-Token: nur diese Liste abmelden, dann Folgeseite zeigen.
  const listResult = await removeMemberByToken(token)
  if (listResult.removed && listResult.subscriberId !== null) {
    const remaining = await getMembershipsForSubscriber(listResult.subscriberId)
    const subscriber = await getDb()
      .select({ token: newsletterSubscribers.token })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.id, listResult.subscriberId))
      .limit(1)
    return (
      <PerListSuccess
        remaining={remaining}
        subscriberToken={subscriber[0]?.token ?? null}
      />
    )
  }

  // 2) Subscriber-Token: komplett abmelden.
  const subscriber = await getSubscriberByToken(token)
  if (subscriber) {
    await cancelEnrollments(subscriber.email)
    const blocked = await blockSubscriberCompletely(token)
    if (blocked) redirect('/newsletter/abgemeldet')
  }

  return <ErrorMessage />
}

interface RemainingMembership {
  listId: number
  name: string
  description: string | null
  isPrimary: boolean
  token: string
}

function PerListSuccess({
  remaining,
  subscriberToken,
}: {
  remaining: RemainingMembership[]
  subscriberToken: string | null
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-2xl bg-[var(--background-card)] p-8 shadow-sm ring-1 ring-[var(--border-color)]">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-900/30">
            <svg className="h-7 w-7 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[var(--foreground)]">Aus dieser Liste abgemeldet</h1>
          <p className="mt-2 text-[var(--foreground-secondary)]">
            Du erhältst aus diesem Newsletter keine weiteren E-Mails.
          </p>
        </div>

        {remaining.length > 0 ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--background)] p-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Du erhältst weiterhin:
            </h2>
            <ul className="mt-3 space-y-2">
              {remaining.map((m) => (
                <li key={m.listId} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">
                      {m.name}
                      {m.isPrimary && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                          Hauptliste
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div className="text-xs text-[var(--foreground-secondary)]">{m.description}</div>
                    )}
                  </div>
                  <Link
                    href={`/unsubscribe?token=${encodeURIComponent(m.token)}`}
                    className="shrink-0 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--background-card)] hover:text-[var(--foreground)]"
                  >
                    Auch abmelden
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--foreground-secondary)]">
            Du hast keine weiteren aktiven Newsletter.
          </p>
        )}

        {subscriberToken && (
          <div className="border-t border-[var(--border-color)] pt-4 text-center text-sm">
            <Link
              href={`/preferences/${encodeURIComponent(subscriberToken)}`}
              className="text-accent-600 underline transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
            >
              Newsletter-Einstellungen verwalten
            </Link>
            {subscriberToken && (
              <>
                <span className="mx-2 text-[var(--foreground-secondary)]">·</span>
                <Link
                  href={`/unsubscribe?token=${encodeURIComponent(subscriberToken)}`}
                  className="text-[var(--foreground-secondary)] underline transition-colors hover:text-red-600 dark:hover:text-red-400"
                >
                  Komplett abmelden
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
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
          Dieser Abmelde-Link ist ungültig oder bereits abgelaufen.
        </p>
      </div>
    </div>
  )
}
