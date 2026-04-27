import FirstNameForm from '@/components/FirstNameForm'

export default async function BestaetigtPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; token?: string }>
}) {
  const { site, token } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-[var(--background-card)] p-8 text-center shadow-sm ring-1 ring-[var(--border-color)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
          <svg className="h-7 w-7 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-[var(--foreground)]">Newsletter bestätigt!</h1>
        <p className="mt-2 text-[var(--foreground-secondary)]">
          Vielen Dank! Du bist jetzt für unseren Newsletter angemeldet und erhältst künftig alle Neuigkeiten direkt per E-Mail.
        </p>

        {token ? (
          <FirstNameForm token={token} siteUrl={site ?? null} />
        ) : (
          site && (
            <a
              href={site}
              className="mt-6 inline-block rounded-full bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
            >
              Zum Blog
            </a>
          )
        )}
      </div>
    </div>
  )
}
