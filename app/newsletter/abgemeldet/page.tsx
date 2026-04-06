export default function AbgemeldetPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="mx-auto max-w-md rounded-2xl bg-[var(--background-card)] p-8 text-center shadow-sm ring-1 ring-[var(--border-color)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-900/30">
          <svg className="h-7 w-7 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-[var(--foreground)]">Abgemeldet</h1>
        <p className="mt-2 text-[var(--foreground-secondary)]">
          Du wurdest erfolgreich vom Newsletter abgemeldet. Du wirst keine weiteren E-Mails von uns erhalten.
        </p>
      </div>
    </div>
  )
}
