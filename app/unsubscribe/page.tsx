import { redirect } from 'next/navigation'
import { getSubscriberByToken, unsubscribeByToken } from '@/lib/newsletter'
import { cancelEnrollments } from '@/lib/automation'
import { removeMemberByToken } from '@/lib/lists'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorMessage />
  }

  // 1) Subscriber-Token (newsletter_subscribers)
  const subscriber = await getSubscriberByToken(token)
  if (subscriber) {
    await cancelEnrollments(subscriber.email)
    const unsubscribed = await unsubscribeByToken(token)
    if (unsubscribed) {
      redirect('/newsletter/abgemeldet')
    }
  }

  // 2) Listen-Member-Token (subscriber_list_members) — manuelle Listen
  const listResult = await removeMemberByToken(token)
  if (listResult.removed) {
    redirect('/newsletter/abgemeldet')
  }

  return <ErrorMessage />
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
