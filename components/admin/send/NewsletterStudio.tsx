'use client'

import React, { useEffect, useRef } from 'react'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import { blocksAreValid, getUsedSlugs } from '@/lib/newsletter-block-helpers'
import type { SiteConfig } from '@/lib/site-config'
import type { NewsletterBlock, PostRef, UserAuthoredBlockType } from '@/lib/newsletter-blocks'
import type { Post } from '../types'
import { DraggablePostItem, SlotCard } from './DragDropSlots'
import InsertToolbar from './InsertToolbar'
import PlaceholderMenu from '../../PlaceholderMenu'

// Inserts `text` at the input's current cursor position and re-focuses it
// with the cursor right after the inserted snippet. Used to drop placeholders
// like {{firstName}} into the subject / preheader inputs from the menu.
function insertAtCursor(
  inputRef: React.RefObject<HTMLInputElement | null>,
  currentValue: string,
  onChange: (value: string) => void,
  text: string,
) {
  const el = inputRef.current
  const start = el?.selectionStart ?? currentValue.length
  const end = el?.selectionEnd ?? currentValue.length
  const next = currentValue.slice(0, start) + text + currentValue.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    if (!el) return
    el.focus()
    const pos = start + text.length
    try { el.setSelectionRange(pos, pos) } catch { /* unsupported on some types */ }
  })
}

interface NewsletterStudioProps {
  subject: string
  onSubjectChange: (value: string) => void
  preheader: string
  onPreheaderChange: (value: string) => void
  abTestEnabled: boolean
  onAbTestEnabledChange: (v: boolean) => void
  subjectVariantB: string
  onSubjectVariantBChange: (value: string) => void
  generatingSubject: boolean
  onGenerateSubject: (target: 'a' | 'b') => void
  blocks: NewsletterBlock[]
  onUpdateBlock: (index: number, updated: NewsletterBlock) => void
  onRemoveBlock: (index: number) => void
  onMoveBlock: (from: number, to: number) => void
  onInsertBlock: (type: UserAuthoredBlockType, at: number) => void
  posts: Post[]
  postsMap: Record<string, PostRef>
  siteConfig: SiteConfig
  viewport: 'desktop' | 'mobile'
  onViewportChange: (viewport: 'desktop' | 'mobile') => void
  onExit: () => void
}

const PREHEADER_MAX = 200

export default function NewsletterStudio({
  subject,
  onSubjectChange,
  preheader,
  onPreheaderChange,
  abTestEnabled,
  onAbTestEnabledChange,
  subjectVariantB,
  onSubjectVariantBChange,
  generatingSubject,
  onGenerateSubject,
  blocks,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onInsertBlock,
  posts,
  postsMap,
  siteConfig,
  viewport,
  onViewportChange,
  onExit,
}: NewsletterStudioProps) {
  const subjectARef = useRef<HTMLInputElement | null>(null)
  const subjectBRef = useRef<HTMLInputElement | null>(null)
  const preheaderRef = useRef<HTMLInputElement | null>(null)

  const usedSlugs = getUsedSlugs(blocks)
  const html = blocksAreValid(blocks)
    ? buildMultiBlockNewsletterHtml(siteConfig, blocks, postsMap, '#', preheader || null)
    : null

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onExit])

  const previewWidth = viewport === 'mobile' ? 375 : 600

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] bg-[var(--background-card)] px-4 py-2.5 lg:flex-row lg:items-start">
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Studio</span>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {abTestEnabled && (
              <span className="shrink-0 rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text)]">A</span>
            )}
            <input
              ref={subjectARef}
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder={abTestEnabled ? 'Betreff Variante A…' : 'Newsletter-Betreff…'}
              className="flex-1 border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-primary-400"
            />
            <PlaceholderMenu
              variant="chip"
              onInsert={(syntax) => insertAtCursor(subjectARef, subject, onSubjectChange, syntax)}
            />
            <button
              type="button"
              onClick={() => onGenerateSubject('a')}
              disabled={generatingSubject || blocks.length === 0}
              className="flex shrink-0 items-center gap-1 border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
              title={abTestEnabled ? 'AI-Vorschläge für Variante A' : 'AI-Vorschläge für Betreff'}
            >
              {generatingSubject ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span>✨</span>
              )}
              <span>AI</span>
            </button>
          </div>
          {abTestEnabled && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text)]">B</span>
              <input
                ref={subjectBRef}
                type="text"
                value={subjectVariantB}
                onChange={(e) => onSubjectVariantBChange(e.target.value)}
                placeholder="Betreff Variante B…"
                className="flex-1 border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-primary-400"
              />
              <PlaceholderMenu
                variant="chip"
                onInsert={(syntax) => insertAtCursor(subjectBRef, subjectVariantB, onSubjectVariantBChange, syntax)}
              />
              <button
                type="button"
                onClick={() => onGenerateSubject('b')}
                disabled={generatingSubject || blocks.length === 0}
                className="flex shrink-0 items-center gap-1 border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                title="AI-Vorschläge für Variante B"
              >
                {generatingSubject ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span>✨</span>
                )}
                <span>AI</span>
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={preheaderRef}
                type="text"
                value={preheader}
                onChange={(e) => onPreheaderChange(e.target.value.slice(0, PREHEADER_MAX))}
                placeholder="Preheader (Vorschauzeile in der Inbox)…"
                maxLength={PREHEADER_MAX}
                className="w-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 pr-12 text-xs text-[var(--text-secondary)] outline-none focus:border-primary-400"
              />
              <span
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-[var(--text-muted)]"
                title={`Empfohlen: ≤ 110 Zeichen (Gmail/Apple Mail Vorschau). Maximum: ${PREHEADER_MAX}.`}
              >
                {preheader.length}/{PREHEADER_MAX}
              </span>
            </div>
            <PlaceholderMenu
              variant="chip"
              onInsert={(syntax) => insertAtCursor(preheaderRef, preheader, onPreheaderChange, syntax)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={abTestEnabled}
              onChange={(e) => onAbTestEnabledChange(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span>A/B-Test (2 Varianten)</span>
            <span className="text-[var(--text-muted)]">— gleichmässige Verteilung, nicht mit STO kombinierbar</span>
          </label>
        </div>

        <div className="flex items-center border border-[var(--border)] bg-[var(--background-card)]" role="group" aria-label="Vorschau-Breite">
          <button
            type="button"
            onClick={() => onViewportChange('desktop')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              viewport === 'desktop'
                ? 'bg-[var(--bg-secondary)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
            title="Desktop-Vorschau (600px)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onViewportChange('mobile')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              viewport === 'mobile'
                ? 'bg-[var(--bg-secondary)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
            title="Mobile-Vorschau (375px)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--background-card)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          title="Studio verlassen (ESC)"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6m0-6l-6 6" />
          </svg>
          Schliessen
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: posts library */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--background-card)] p-3">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Artikel · Drag &amp; Drop
          </h3>
          <div className="space-y-2">
            {posts.slice(0, 30).map((post) => (
              <DraggablePostItem key={post.slug} post={post} isUsed={usedSlugs.has(post.slug)} />
            ))}
          </div>
        </aside>

        {/* Middle: editor */}
        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-1">
            <InsertToolbar onInsert={(type) => onInsertBlock(type, 0)} alwaysExpanded={blocks.length === 0} />
            {blocks.map((block, i) => (
              <React.Fragment key={block.id}>
                <SlotCard
                  block={block}
                  index={i}
                  posts={posts}
                  allBlocks={blocks}
                  onUpdate={(updated) => onUpdateBlock(i, updated)}
                  onRemove={() => onRemoveBlock(i)}
                  onMove={onMoveBlock}
                />
                <InsertToolbar onInsert={(type) => onInsertBlock(type, i + 1)} alwaysExpanded={i === blocks.length - 1} />
              </React.Fragment>
            ))}
          </div>
        </main>

        {/* Right: live preview */}
        <aside className="flex w-1/2 max-w-[760px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Live-Vorschau · {viewport === 'mobile' ? '375 px' : '600 px'}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {html ? (
              <iframe
                key={viewport}
                title="Newsletter-Vorschau"
                srcDoc={html}
                style={{ width: previewWidth, height: '100%', minHeight: '600px' }}
                className="mx-auto block border border-[var(--border)] bg-white shadow-sm"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-[var(--text-muted)]">
                Füge Inhalte hinzu, um die Vorschau zu sehen.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
