'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/ToastProvider'
import NewsletterStudio from '@/components/admin/send/NewsletterStudio'
import { buildPostsMap } from '@/lib/newsletter-block-helpers'
import { createBlock } from '@/lib/newsletter-block-helpers'
import type { NewsletterBlock, UserAuthoredBlockType } from '@/lib/newsletter-blocks'
import { PREVIEW_SITE_CONFIG } from '@/emails/_preview-data'
import type { Post } from '@/components/admin/types'
import type { NewsletterDraft } from '@/lib/newsletter-drafts'
import DraftStatusBadge from './DraftStatusBadge'
import FinalizeDialog from './FinalizeDialog'
import DraftTestSendDialog from './DraftTestSendDialog'

const AUTOSAVE_DELAY_MS = 1000

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface Props {
  draftId: string
}

interface EditorState {
  subject: string
  preheader: string
  blocks: NewsletterBlock[]
  abTestEnabled: boolean
  subjectVariantB: string
}

function buildState(draft: NewsletterDraft): EditorState {
  return {
    subject: draft.subject,
    preheader: draft.preheader ?? '',
    blocks: draft.blocks,
    abTestEnabled: draft.abTestEnabled,
    subjectVariantB: draft.subjectVariantB ?? '',
  }
}

export default function DraftEditor({ draftId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState<NewsletterDraft | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showFinalize, setShowFinalize] = useState(false)
  const [showTestSend, setShowTestSend] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorState | null>(null)
  editorRef.current = editor

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [draftRes, listsRes] = await Promise.all([
          fetch(`/api/admin/newsletter/drafts/${draftId}`),
          fetch('/api/admin/newsletter?posts=1'),
        ])
        if (cancelled) return
        if (draftRes.status === 404) { setNotFound(true); return }
        if (!draftRes.ok) throw new Error('draft fetch failed')
        const draftData = await draftRes.json()
        const listsData = listsRes.ok ? await listsRes.json() : { posts: [] }
        if (cancelled) return
        setDraft(draftData.draft)
        setEditor(buildState(draftData.draft))
        setPosts(listsData.posts ?? [])
      } catch {
        if (!cancelled) toast.error('Draft konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [draftId, toast])

  const persist = useCallback(async (next: EditorState) => {
    setSaveState('saving')
    try {
      const res = await fetch(`/api/admin/newsletter/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: next.subject,
          preheader: next.preheader || null,
          blocks: next.blocks,
          abTestEnabled: next.abTestEnabled,
          subjectVariantB: next.subjectVariantB || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.code === 'INVALID_STATUS') {
          toast.error('Entwurf wurde gesendet/archiviert und kann nicht mehr bearbeitet werden.')
        }
        setSaveState('error')
        return
      }
      const data = await res.json()
      setDraft(data.draft)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [draftId, toast])

  const scheduleSave = useCallback((next: EditorState) => {
    setSaveState('pending')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const current = editorRef.current
      if (current) persist(current)
    }, AUTOSAVE_DELAY_MS)
  }, [persist])

  const update = useCallback((patch: Partial<EditorState>) => {
    setEditor((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  // Flush any pending save on unmount so navigating away keeps the latest edit.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        const current = editorRef.current
        if (current) {
          // Fire-and-forget; navigator.sendBeacon isn't ideal for PATCH+JSON,
          // so just kick off the fetch — the response is irrelevant here.
          fetch(`/api/admin/newsletter/drafts/${draftId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: current.subject,
              preheader: current.preheader || null,
              blocks: current.blocks,
              abTestEnabled: current.abTestEnabled,
              subjectVariantB: current.subjectVariantB || null,
            }),
            keepalive: true,
          }).catch(() => { /* ignore */ })
        }
      }
    }
  }, [draftId])

  const postsMap = useMemo(
    () => (editor ? buildPostsMap(editor.blocks, posts) : {}),
    [editor, posts],
  )

  const handleExit = useCallback(() => {
    router.push('/admin/newsletter/compose')
  }, [router])

  const handleFinalized = useCallback((next: NewsletterDraft) => {
    setDraft(next)
    setShowFinalize(false)
    toast.success('Entwurf zum Senden freigegeben.')
    router.push('/admin/newsletter/compose')
  }, [router, toast])

  const handleTestSent = useCallback((next: NewsletterDraft) => {
    setDraft(next)
    setShowTestSend(false)
    toast.success(`Test-Mail an ${next.lastTestedTo} gesendet.`)
  }, [toast])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Lade Entwurf…
      </div>
    )
  }

  if (notFound || !draft || !editor) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-[var(--text-muted)]">Dieser Entwurf existiert nicht (mehr).</p>
        <button onClick={handleExit} className="glass-button">Zurück zur Übersicht</button>
      </div>
    )
  }

  const readOnly = draft.status === 'sent' || draft.status === 'archived' || draft.status === 'scheduled'
  const isReadyToSend = draft.status === 'ready_to_send'

  const onInsertBlock = (type: UserAuthoredBlockType, at: number) => {
    update({
      blocks: (() => {
        const next = [...editor.blocks]
        next.splice(at, 0, createBlock(type))
        return next
      })(),
    })
  }
  const onUpdateBlock = (index: number, updated: NewsletterBlock) => {
    update({
      blocks: editor.blocks.map((b, i) => (i === index ? updated : b)),
    })
  }
  const onRemoveBlock = (index: number) => {
    update({ blocks: editor.blocks.filter((_, i) => i !== index) })
  }
  const onMoveBlock = (from: number, to: number) => {
    if (from === to) return
    const next = [...editor.blocks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update({ blocks: next })
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <SaveIndicator state={saveState} />
      <DraftStatusBadge status={draft.status} />
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setShowTestSend(true)}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 h-8 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)] hover:bg-[var(--background-elevated)]"
            title="Test-E-Mail senden"
          >
            Test
          </button>
          {!isReadyToSend && (
            <button
              type="button"
              onClick={() => setShowFinalize(true)}
              className="rounded-full bg-emerald-500 px-3 h-8 text-[10px] font-semibold uppercase tracking-widest text-white hover:bg-emerald-600"
              title="Zum Senden freigeben"
            >
              Finalisieren
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <>
      <NewsletterStudio
        subject={editor.subject}
        onSubjectChange={(v) => update({ subject: v })}
        preheader={editor.preheader}
        onPreheaderChange={(v) => update({ preheader: v })}
        abTestEnabled={editor.abTestEnabled}
        onAbTestEnabledChange={(v) => update({ abTestEnabled: v })}
        subjectVariantB={editor.subjectVariantB}
        onSubjectVariantBChange={(v) => update({ subjectVariantB: v })}
        blocks={editor.blocks}
        onUpdateBlock={onUpdateBlock}
        onRemoveBlock={onRemoveBlock}
        onMoveBlock={onMoveBlock}
        onInsertBlock={onInsertBlock}
        posts={posts}
        postsMap={postsMap}
        siteConfig={PREVIEW_SITE_CONFIG}
        viewport={viewport}
        onViewportChange={setViewport}
        onExit={handleExit}
        extraHeaderActions={headerActions}
      />
      {showFinalize && (
        <FinalizeDialog
          draft={{ ...draft, ...editor, preheader: editor.preheader || null, subjectVariantB: editor.subjectVariantB || null }}
          onClose={() => setShowFinalize(false)}
          onFinalized={handleFinalized}
          onError={(msg) => toast.error(msg)}
        />
      )}
      {showTestSend && (
        <DraftTestSendDialog
          draft={draft}
          onClose={() => setShowTestSend(false)}
          onSent={handleTestSent}
          onError={(msg) => toast.error(msg)}
        />
      )}
    </>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  let label = ''
  let cls = 'text-[var(--text-muted)]'
  switch (state) {
    case 'pending':
      label = 'Änderungen…'
      cls = 'text-[var(--text-muted)]'
      break
    case 'saving':
      label = 'Speichert…'
      cls = 'text-[var(--text-muted)]'
      break
    case 'saved':
      label = 'Gespeichert'
      cls = 'text-emerald-600 dark:text-emerald-400'
      break
    case 'error':
      label = 'Fehler beim Speichern'
      cls = 'text-red-600 dark:text-red-400'
      break
    default:
      return null
  }
  return <span className={`text-[10px] font-medium uppercase tracking-wider ${cls}`}>{label}</span>
}
