import { redirect } from 'next/navigation'
import { getSubscriberByToken, unsubscribeByToken } from '@/lib/newsletter'
import { cancelEnrollments } from '@/lib/automation'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorMessage />
  }

  const subscriber = await getSubscriberByToken(token)
  if (subscriber) {
    await cancelEnrollments(subscriber.email)
  }

  const unsubscribed = await unsubscribeByToken(token)
  if (!unsubscribed) {
    return <ErrorMessage />
  }

  redirect('/newsletter/abgemeldet')
}

function ErrorMessage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-2xl">😕</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Ungültiger Link</h1>
        <p className="mt-2 text-gray-600">
          Dieser Abmelde-Link ist ungültig oder bereits abgelaufen.
        </p>
      </div>
    </div>
  )
}
