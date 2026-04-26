'use client'

import dynamic from 'next/dynamic'

// Lazy-load the full Tiptap/ProseMirror editor — keeps it out of the
// initial bundle. The editor is purely client-side, so SSR is disabled.
const TiptapEditor = dynamic(() => import('./TiptapEditor.impl'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[120px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-muted)]">
      Editor wird geladen…
    </div>
  ),
})

export default TiptapEditor
