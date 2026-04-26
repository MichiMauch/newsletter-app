'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUILT_IN_TEMPLATES,
  type NewsletterBlock,
  type NewsletterTemplate,
  type UserAuthoredBlockType,
} from '@/lib/newsletter-blocks'
import {
  blocksAreValid,
  blocksFromTemplate,
  createBlock,
  getUsedSlugs,
  parseScheduleLocal,
} from '@/lib/newsletter-block-helpers'
import {
  loadCustomTemplates,
  saveCustomTemplates,
  loadDrafts,
  saveDrafts,
} from '@/lib/newsletter-storage'
import type {
  AudienceFilter,
  ConfirmActionState,
  NewsletterDraft,
  Post,
  SendSubTab,
  Tab,
} from '@/components/admin/types'
import type { useToast } from '@/components/ui/ToastProvider'

type ToastApi = ReturnType<typeof useToast>
type ComposeMode = 'pick-template' | 'fill-slots' | 'build-template'
type ComposeStep = 'content' | 'audience' | 'review'

interface UseComposeStateInput {
  posts: Post[]
  confirmedCount: number
  tab: Tab
  sendSubTab: SendSubTab
  toast: ToastApi
  setConfirmAction: (action: ConfirmActionState) => void
  streamingSend: (
    body: object,
    onProgress: (data: { sent: number; total: number; remaining: number }) => void,
  ) => Promise<{ sent: number; total: number }>
  loadData: () => void | Promise<void>
}

export function useComposeState({
  posts,
  confirmedCount,
  tab,
  sendSubTab,
  toast,
  setConfirmAction,
  streamingSend,
  loadData,
}: UseComposeStateInput) {
  // ─── Core compose state ───
  const [composeMode, setComposeMode] = useState<ComposeMode>('pick-template')
  const [composeStep, setComposeStep] = useState<ComposeStep>('content')
  const [selectedTemplate, setSelectedTemplate] = useState<NewsletterTemplate | null>(null)
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([])
  const [subject, setSubject] = useState('')
  const [generatingSubject, setGeneratingSubject] = useState(false)
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])
  const [showSubjectPicker, setShowSubjectPicker] = useState(false)
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter | null>(null)
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  // Lazy initializer reads localStorage once on mount (skipped on server).
  const [customTemplates, setCustomTemplates] = useState<NewsletterTemplate[]>(loadCustomTemplates)
  const [drafts, setDrafts] = useState<NewsletterDraft[]>(loadDrafts)

  // ─── Test send ───
  const [showTestSend, setShowTestSend] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  // ─── Send-Time Optimization ───
  const [useSto, setUseSto] = useState(false)

  // ─── Geplanter Versand ───
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduleLocal, setScheduleLocal] = useState('')

  // ─── Empfänger-Listen (manuelle Listen) ───
  const [availableLists, setAvailableLists] = useState<{ id: number; name: string; member_count: number }[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)

  // ─── Studio fullscreen ───
  const [studioMode, setStudioMode] = useState(false)
  const [studioViewport, setStudioViewport] = useState<'desktop' | 'mobile'>('desktop')

  // ─── Derived values ───
  const selectedList = selectedListId ? availableLists.find((l) => l.id === selectedListId) : null
  const audienceCount = selectedList
    ? selectedList.member_count
    : (audienceFilter ? audienceFilter.count : confirmedCount)
  const canSend = subject.trim() !== '' && blocksAreValid(blocks) && audienceCount > 0
  const usedSlugsKey = useMemo(
    () => [...new Set([...getUsedSlugs(blocks)])].sort().join('|'),
    [blocks],
  )

  // ─── Effects ───
  useEffect(() => {
    if (!(tab === 'send' && sendSubTab === 'compose')) return
    fetch('/api/admin/lists')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.lists) {
          setAvailableLists(data.lists.map((l: { id: number; name: string; member_count: number }) => ({
            id: l.id, name: l.name, member_count: l.member_count,
          })))
        }
      })
      .catch(() => { /* silent */ })
  }, [tab, sendSubTab])

  useEffect(() => {
    // Reset audience filter whenever the post selection changes — the cached
    // count would otherwise drift from the actual segment for the new tag set.
    setAudienceFilter(null)
  }, [usedSlugsKey])

  // ─── Block manipulation ───
  const updateBlock = useCallback((index: number, updated: NewsletterBlock) => {
    setBlocks((prev) => {
      const next = [...prev]
      next[index] = updated
      return next
    })
  }, [])

  const removeBlock = useCallback((index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveBlock = useCallback((from: number, to: number) => {
    if (from === to) return
    setBlocks((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const insertBlock = useCallback((type: UserAuthoredBlockType, at: number) => {
    setBlocks((prev) => {
      const next = [...prev]
      next.splice(at, 0, createBlock(type))
      return next
    })
  }, [])

  // ─── Template / mode navigation ───
  const selectTemplate = useCallback((template: NewsletterTemplate) => {
    setSelectedTemplate(template)
    setBlocks(blocksFromTemplate(template))
    setSubject('')
    setComposeMode('fill-slots')
    setComposeStep('content')
  }, [])

  const goBackToPicker = useCallback(() => {
    setSelectedTemplate(null)
    setBlocks([])
    setSubject('')
    setComposeMode('pick-template')
    setComposeStep('content')
  }, [])

  // ─── AI Subject generation ───
  const generateSubject = useCallback(async () => {
    setGeneratingSubject(true)
    setSubjectOptions([])
    setShowSubjectPicker(true)
    try {
      // Index posts by slug once — avoid O(blocks × posts) find loop.
      const bySlug = new Map<string, Post>()
      for (const p of posts) bySlug.set(p.slug, p)
      const postData: Array<{ title: string; summary: string }> = []
      for (const block of blocks) {
        if (block.type === 'hero' && block.slug) {
          const p = bySlug.get(block.slug)
          if (p) postData.push({ title: p.title, summary: p.summary })
        }
        if (block.type === 'link-list') {
          for (const s of block.slugs) {
            const p = bySlug.get(s)
            if (p) postData.push({ title: p.title, summary: p.summary })
          }
        }
      }
      if (postData.length === 0) {
        setShowSubjectPicker(false)
        return
      }
      const res = await fetch('/api/admin/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subject', posts: postData }),
      })
      if (!res.ok) throw new Error('Fehler beim Generieren')
      const data = await res.json()
      if (Array.isArray(data.subjects) && data.subjects.length > 0) {
        setSubjectOptions(data.subjects)
      } else if (typeof data.text === 'string' && data.text.trim()) {
        setSubjectOptions([data.text.trim()])
      } else {
        setShowSubjectPicker(false)
        toast.error('AI-Generierung fehlgeschlagen.')
      }
    } catch (err) {
      console.error('[generateSubject]', err)
      setShowSubjectPicker(false)
      toast.error('AI-Generierung fehlgeschlagen.')
    } finally {
      setGeneratingSubject(false)
    }
  }, [blocks, posts, toast])

  // ─── Custom templates ───
  const handleSaveCustomTemplate = useCallback((template: NewsletterTemplate) => {
    setCustomTemplates((prev) => {
      const updated = [...prev, template]
      saveCustomTemplates(updated)
      return updated
    })
    setComposeMode('pick-template')
  }, [])

  const handleDeleteCustomTemplate = useCallback((id: string) => {
    setConfirmAction({
      title: 'Template löschen',
      message: 'Template wirklich löschen?',
      onConfirm: () => {
        setConfirmAction(null)
        setCustomTemplates((prev) => {
          const updated = prev.filter((t) => t.id !== id)
          saveCustomTemplates(updated)
          return updated
        })
        toast.success('Template gelöscht.')
      },
    })
  }, [setConfirmAction, toast])

  // ─── Drafts ───
  const handleSaveDraft = useCallback(() => {
    const draft: NewsletterDraft = {
      id: crypto.randomUUID(),
      subject,
      blocks,
      templateId: selectedTemplate?.id ?? null,
      savedAt: new Date().toISOString(),
    }
    setDrafts((prev) => {
      const updated = [draft, ...prev]
      saveDrafts(updated)
      return updated
    })
    toast.success('Entwurf gespeichert.')
  }, [subject, blocks, selectedTemplate, toast])

  const handleLoadDraft = useCallback((draft: NewsletterDraft) => {
    const template = [...BUILT_IN_TEMPLATES, ...customTemplates].find((t) => t.id === draft.templateId) ?? BUILT_IN_TEMPLATES[0]
    setSelectedTemplate(template)
    setBlocks(draft.blocks)
    setSubject(draft.subject)
    setComposeMode('fill-slots')
    setComposeStep('content')
  }, [customTemplates])

  const handleDeleteDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const updated = prev.filter((d) => d.id !== id)
      saveDrafts(updated)
      return updated
    })
    toast.success('Entwurf gelöscht.')
  }, [toast])

  // ─── Sending ───
  const handleSendClick = useCallback(() => {
    if (!canSend) return
    if (scheduleMode === 'scheduled') {
      const date = parseScheduleLocal(scheduleLocal)
      if (!date) {
        toast.error('Bitte ein gültiges Datum & Uhrzeit wählen.')
        return
      }
      if (date.getTime() <= Date.now() + 60_000) {
        toast.error('Geplanter Zeitpunkt muss in der Zukunft liegen.')
        return
      }
    }
    setConfirmSend(true)
  }, [canSend, scheduleMode, scheduleLocal, toast])

  const handleTestSendConfirmed = useCallback(async () => {
    if (!testEmail.trim()) return
    setShowTestSend(false)
    setSending(true)
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-send', subject, blocks, testEmail: testEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Test-Newsletter an ${testEmail.trim()} gesendet.`)
      } else {
        toast.error(data.error || 'Testversand fehlgeschlagen.')
      }
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
    } finally {
      setSending(false)
    }
  }, [testEmail, subject, blocks, toast])

  const handleSendConfirmed = useCallback(async () => {
    setConfirmSend(false)
    setSending(true)
    try {
      const audiencePayload = !selectedListId && audienceFilter
        ? { tags: audienceFilter.tags, minSignal: audienceFilter.mode === 'high' ? 5 : 1 }
        : undefined
      const listIdPayload = selectedListId ?? undefined
      const scheduledDate = scheduleMode === 'scheduled' ? parseScheduleLocal(scheduleLocal) : null
      if (scheduledDate) {
        const res = await fetch('/api/admin/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send', subject, blocks,
            audienceFilter: audiencePayload,
            listId: listIdPayload,
            scheduledFor: scheduledDate.toISOString(),
            useSto: useSto || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Fehler beim Planen.')
        const when = scheduledDate.toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })
        if (useSto) {
          const latest = data.latest ? new Date(data.latest).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '?'
          toast.success(`Newsletter geplant ab ${when} mit STO (${data.enqueued} Empfänger, letzter spätestens ${latest}).`)
        } else {
          toast.success(`Newsletter geplant für ${when} (${data.enqueued} Empfänger).`)
        }
      } else if (useSto) {
        const res = await fetch('/api/admin/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', subject, blocks, useSto: true, audienceFilter: audiencePayload, listId: listIdPayload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Fehler beim Versenden.')
        const earliest = data.earliest ? new Date(data.earliest).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '?'
        const latest = data.latest ? new Date(data.latest).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '?'
        toast.success(`${data.enqueued} Mails geplant (${earliest} – ${latest}). ${data.pushed_now} sofort an Resend gesendet.`)
      } else {
        const result = await streamingSend(
          { action: 'send', subject, blocks, audienceFilter: audiencePayload, listId: listIdPayload },
          ({ sent, total }) => toast.info(`${sent} von ${total} gesendet…`),
        )
        toast.success(`Erfolgreich an ${result.sent} Empfänger versendet.`)
      }
      goBackToPicker()
      loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSending(false)
    }
  }, [
    selectedListId, audienceFilter, scheduleMode, scheduleLocal, useSto,
    subject, blocks, streamingSend, goBackToPicker, loadData, toast,
  ])

  return {
    // state
    composeMode, setComposeMode,
    composeStep, setComposeStep,
    selectedTemplate, setSelectedTemplate,
    blocks, setBlocks,
    subject, setSubject,
    generatingSubject,
    subjectOptions,
    showSubjectPicker, setShowSubjectPicker,
    audienceFilter, setAudienceFilter,
    sending,
    showPreview, setShowPreview,
    confirmSend, setConfirmSend,
    customTemplates,
    drafts,
    showTestSend, setShowTestSend,
    testEmail, setTestEmail,
    useSto, setUseSto,
    scheduleMode, setScheduleMode,
    scheduleLocal, setScheduleLocal,
    availableLists,
    selectedListId, setSelectedListId,
    studioMode, setStudioMode,
    studioViewport, setStudioViewport,
    // derived
    selectedList,
    audienceCount,
    canSend,
    usedSlugsKey,
    // handlers
    selectTemplate,
    goBackToPicker,
    generateSubject,
    updateBlock,
    removeBlock,
    moveBlock,
    insertBlock,
    handleSaveCustomTemplate,
    handleDeleteCustomTemplate,
    handleSaveDraft,
    handleLoadDraft,
    handleDeleteDraft,
    handleSendClick,
    handleTestSendConfirmed,
    handleSendConfirmed,
  }
}
