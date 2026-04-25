'use client'

import React, { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import TiptapEditor from './TiptapEditor'
import AutomationEditor from './AutomationEditor'
import DashboardTab from './admin/DashboardTab'
import SubscribersTab from './admin/SubscribersTab'
import SettingsTab from './admin/SettingsTab'
import HistoryTab from './admin/HistoryTab'
import LoginForm from './admin/LoginForm'
import EngagementTrendChart from './admin/charts/EngagementTrendChart'
import SubscriberGrowthChart from './admin/charts/SubscriberGrowthChart'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import type { SiteConfig } from '@/lib/site-config'
import {
  BUILT_IN_TEMPLATES,
  type NewsletterBlock,
  type NewsletterTemplate,
  type PostRef,
  type UserAuthoredBlockType,
} from '@/lib/newsletter-blocks'
import { PREVIEW_SITE_CONFIG } from '@/emails/_preview-data'

// --- Types -------------------------------------------------------------

interface Subscriber {
  id: number
  email: string
  status: 'pending' | 'confirmed' | 'unsubscribed'
  createdAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
}

interface NewsletterSend {
  id: number
  post_slug: string
  post_title: string
  subject: string
  sent_at: string
  recipient_count: number
  delivered_count?: number
  clicked_count?: number
  bounced_count?: number
  complained_count?: number
}

interface NewsletterRecipientRow {
  id: number
  email: string
  resend_email_id: string | null
  status: 'sent' | 'delivered' | 'clicked' | 'bounced' | 'complained'
  delivered_at: string | null
  clicked_at: string | null
  click_count: number
  bounced_at: string | null
  bounce_type: string | null
  complained_at: string | null
}

interface LinkClickRow {
  url: string
  click_count: number
  unique_clickers: number
}

interface OverallStatsData {
  total_sends: number
  total_recipients: number
  avg_click_rate: number
  avg_bounce_rate: number
  total_complaints: number
}

interface Post {
  slug: string
  title: string
  summary: string
  image: string | null
  date: string
}

interface SendTrend {
  id: number
  subject: string
  sent_at: string
  recipient_count: number
  click_rate: number
  bounce_rate: number
}

interface SubscriberGrowth {
  month: string
  total: number
  new_count: number
}

type Tab = 'dashboard' | 'compose' | 'subscribers' | 'history' | 'settings' | 'automations'

function tabToHref(tab: Tab): string {
  return tab === 'dashboard' ? '/admin/newsletter' : `/admin/newsletter/${tab}`
}

function pathToTab(pathname: string): Tab {
  const segment = pathname.replace('/admin/newsletter', '').replace(/^\//, '').split('/')[0]
  if (!segment) return 'dashboard'
  const tabs: Tab[] = ['compose', 'subscribers', 'history', 'settings', 'automations']
  return tabs.includes(segment as Tab) ? (segment as Tab) : 'dashboard'
}
type ComposeMode = 'pick-template' | 'fill-slots' | 'build-template'

// --- Helpers -----------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  confirmed: {
    label: 'Bestätigt',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  },
  pending: {
    label: 'Ausstehend',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  },
  unsubscribed: {
    label: 'Abgemeldet',
    cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  },
}

const blockTypeLabels: Record<NewsletterBlock['type'], string> = {
  hero: 'Hero',
  text: 'Freitext',
  'link-list': 'Link-Liste',
  last_newsletter: 'Letzter Newsletter',
  recap_header: 'Recap-Trenner',
}

function createBlock(type: UserAuthoredBlockType): NewsletterBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'hero':
      return { id, type: 'hero', slug: '' }
    case 'text':
      return { id, type: 'text', content: '' }
    case 'link-list':
      return { id, type: 'link-list', slugs: [] }
    case 'last_newsletter':
      return { id, type: 'last_newsletter' }
  }
}

function blocksFromTemplate(template: NewsletterTemplate): NewsletterBlock[] {
  return template.slots.map((slot) => createBlock(slot.type as UserAuthoredBlockType))
}

function blocksAreValid(blocks: NewsletterBlock[]): boolean {
  if (blocks.length === 0) return false
  return blocks.every((block) => {
    switch (block.type) {
      case 'hero':
        return block.slug !== ''
      case 'text':
        return block.content.trim() !== ''
      case 'link-list':
        return block.slugs.length > 0
      case 'last_newsletter':
        return true
      case 'recap_header':
        return true
    }
  })
}

function buildPostsMap(blocks: NewsletterBlock[], posts: Post[]): Record<string, PostRef> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') slugs.add(block.slug)
    if (block.type === 'link-list') block.slugs.forEach((s) => slugs.add(s))
  }
  const map: Record<string, PostRef> = {}
  for (const slug of slugs) {
    const post = posts.find((p) => p.slug === slug)
    if (post) map[slug] = post
  }
  return map
}

const STORAGE_KEY = 'newsletter-templates'
const DRAFTS_KEY = 'newsletter-drafts'

interface NewsletterDraft {
  id: string
  subject: string
  blocks: NewsletterBlock[]
  templateId: string | null
  savedAt: string
}

function loadCustomTemplates(): NewsletterTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveCustomTemplates(templates: NewsletterTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

function loadDrafts(): NewsletterDraft[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveDrafts(drafts: NewsletterDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

// --- Helpers: used slugs ----------------------------------------------

function getUsedSlugs(blocks: NewsletterBlock[]): Set<string> {
  const slugs = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'hero') {
      if (block.slug) slugs.add(block.slug)
    }
    if (block.type === 'link-list') {
      block.slugs.forEach((s) => { if (s) slugs.add(s) })
    }
  }
  return slugs
}

// --- Reusable UI ------------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text)] outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30'

// --- Drag & Drop Components ------------------------------------------

function DraggablePostItem({
  post,
  isUsed,
}: {
  post: Post
  isUsed: boolean
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', post.slug)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={`flex cursor-grab items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-3 py-2 transition-all active:cursor-grabbing ${
        isUsed
          ? 'opacity-40'
          : 'hover:border-primary-400 dark:hover:border-primary-500'
      }`}
    >
      {post.image ? (
        <img
          src={post.image}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
          Bild
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text)]">{post.title}</div>
        <div className="text-xs text-[var(--text-secondary)]">{formatDateShort(post.date)}</div>
      </div>
    </div>
  )
}

function DropSlot({
  slug,
  posts,
  onDrop,
  onClear,
  label,
}: {
  slug: string
  posts: Post[]
  onDrop: (slug: string) => void
  onClear: () => void
  label?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const post = slug ? posts.find((p) => p.slug === slug) : null

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedSlug = e.dataTransfer.getData('text/plain')
    if (droppedSlug) onDrop(droppedSlug)
  }

  if (post) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragEnter={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 transition-colors ${
          dragOver
            ? 'border-primary-400 bg-primary-50/50 dark:border-primary-500 dark:bg-primary-900/20'
            : 'border-[var(--border)] bg-[var(--background-card)]'
        }`}
      >
        {label && (
          <div className="px-3 pt-2 text-xs font-medium text-[var(--text-secondary)]">{label}</div>
        )}
        <div className="flex items-center gap-3 p-3">
          {post.image ? (
            <img src={post.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)]">
              Bild
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--text)]">{post.title}</div>
            <div className="text-xs text-[var(--text-secondary)]">{formatDateShort(post.date)}</div>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            title="Entfernen"
          >
            &times;
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
        dragOver
          ? 'border-primary-400 bg-primary-50/50 text-primary-600 dark:border-primary-500 dark:bg-primary-900/20 dark:text-primary-400'
          : 'border-[var(--border)] text-[var(--text-secondary)]'
      }`}
    >
      {label && <div className="mb-1 text-xs font-medium">{label}</div>}
      <div className="text-sm">Artikel hierher ziehen</div>
    </div>
  )
}

// --- Template Card (for picker grid) ----------------------------------

const slotMiniIcons: Record<NewsletterBlock['type'], React.ReactElement> = {
  hero: (
    <div className="mb-1 h-4 rounded bg-primary-200 dark:bg-primary-800" />
  ),
  text: (
    <div className="mb-1 space-y-0.5">
      <div className="h-1 w-full rounded bg-[var(--border)]" />
      <div className="h-1 w-3/4 rounded bg-[var(--border)]" />
    </div>
  ),
  'link-list': (
    <div className="mb-1 space-y-0.5">
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-3/4 rounded bg-primary-100 dark:bg-primary-900" />
    </div>
  ),
  last_newsletter: (
    <div className="mb-1 h-4 rounded bg-amber-200 dark:bg-amber-800" />
  ),
  recap_header: <div className="mb-1 h-1 rounded bg-[var(--border)]" />,
}

function TemplateCard({
  template,
  onSelect,
  onDelete,
}: {
  template: NewsletterTemplate
  onSelect: () => void
  onDelete?: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-4 text-left transition-all hover:border-primary-400 dark:hover:border-primary-500" style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {onDelete && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute right-2 top-2 hidden rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-500 group-hover:inline-block dark:bg-red-900/30"
        >
          &times;
        </span>
      )}
      <div className="mb-3 space-y-1 rounded-lg bg-[var(--bg-secondary)] p-2">
        {template.slots.map((slot, i) => (
          <div key={i}>{slotMiniIcons[slot.type]}</div>
        ))}
      </div>
      <span className="text-xs font-semibold text-[var(--text)]">{template.name}</span>
    </button>
  )
}

// --- Insert Toolbar (between blocks) ----------------------------------

function InsertToolbar({ onInsert, alwaysExpanded }: {
  onInsert: (type: UserAuthoredBlockType) => void
  alwaysExpanded?: boolean
}) {
  const [open, setOpen] = useState(false)

  const btnCls =
    'rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

  if (open || alwaysExpanded) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-1"
        onMouseLeave={alwaysExpanded ? undefined : () => setOpen(false)}
      >
        <button onClick={() => { onInsert('hero'); setOpen(false) }} className={btnCls}>+ Hero</button>
        <button onClick={() => { onInsert('text'); setOpen(false) }} className={btnCls}>+ Freitext</button>
        <button onClick={() => { onInsert('link-list'); setOpen(false) }} className={btnCls}>+ Link-Liste</button>
      </div>
    )
  }

  return (
    <div className="group flex items-center justify-center py-1">
      <div className="h-px flex-1 border-t border-dashed border-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100" />
      <button
        onClick={() => setOpen(true)}
        className="mx-2 flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] opacity-40 transition-all hover:border-primary-400 hover:text-primary-500 group-hover:opacity-100 "
        title="Block einfügen"
      >
        +
      </button>
      <div className="h-px flex-1 border-t border-dashed border-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}

// --- Slot Card (for fill-slots view) ----------------------------------

function SlotCard({
  block,
  index,
  posts,
  allBlocks,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: NewsletterBlock
  index: number
  posts: Post[]
  allBlocks?: NewsletterBlock[]
  onUpdate: (updated: NewsletterBlock) => void
  onRemove?: () => void
  onMove: (from: number, to: number) => void
}) {
  const [generatingIntro, setGeneratingIntro] = useState(false)
  const [dragOver, setDragOver] = useState<'above' | 'below' | null>(null)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/x-block-index', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('application/x-block-index')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDragOver(e.clientY < midY ? 'above' : 'below')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(null)
    const fromStr = e.dataTransfer.getData('application/x-block-index')
    if (!fromStr) return
    const from = Number(fromStr)
    const to = dragOver === 'above' ? index : index + 1
    const adjustedTo = from < to ? to - 1 : to
    onMove(from, adjustedTo)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(null)}
      onDrop={handleDrop}
      className={`relative rounded-xl border bg-[var(--background-card)] p-4 ${
        dragOver === 'above'
          ? 'border-t-primary-500 border-t-4 border-x-[var(--border)] border-b-[var(--border)] bg-primary-50/30 dark:bg-primary-900/10'
          : dragOver === 'below'
            ? 'border-b-primary-500 border-b-4 border-x-[var(--border)] border-t-[var(--border)] bg-primary-50/30 dark:bg-primary-900/10'
            : 'border-[var(--border)]'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="cursor-grab text-[var(--text-muted)] active:cursor-grabbing" title="Ziehen zum Umsortieren">&#x2807;</span>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {blockTypeLabels[block.type]}
          </span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            title="Block entfernen"
          >
            &times;
          </button>
        )}
      </div>

      {block.type === 'hero' && (
        <DropSlot
          slug={block.slug}
          posts={posts}
          onDrop={(slug) => onUpdate({ ...block, slug })}
          onClear={() => onUpdate({ ...block, slug: '' })}
        />
      )}

      {block.type === 'link-list' && (
        <div className="space-y-2">
          {block.slugs.map((slug, i) => (
            <DropSlot
              key={i}
              slug={slug}
              posts={posts}
              onDrop={(newSlug) => {
                const newSlugs = [...block.slugs]
                newSlugs[i] = newSlug
                onUpdate({ ...block, slugs: newSlugs })
              }}
              onClear={() => {
                const newSlugs = block.slugs.filter((_, idx) => idx !== i)
                onUpdate({ ...block, slugs: newSlugs })
              }}
              label={`Artikel ${i + 1}`}
            />
          ))}
          <button
            onClick={() => onUpdate({ ...block, slugs: [...block.slugs, ''] })}
            className="w-full rounded-xl border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          >
            + Artikel hinzufügen
          </button>
        </div>
      )}

      {block.type === 'text' && (
        <div>
          <TiptapEditor
            content={block.content}
            onChange={(html) => onUpdate({ ...block, content: html })}
            placeholder="Freitext eingeben…"
          />
          {allBlocks && (
            <button
              onClick={async () => {
                setGeneratingIntro(true)
                try {
                  // Collect post info from all blocks
                  const postData: Array<{ title: string; summary: string }> = []
                  for (const b of allBlocks) {
                    if (b.type === 'hero' && b.slug) {
                      const p = posts.find((x) => x.slug === b.slug)
                      if (p) postData.push({ title: p.title, summary: p.summary })
                    }
                    if (b.type === 'link-list') {
                      for (const s of b.slugs) {
                        const p = posts.find((x) => x.slug === s)
                        if (p) postData.push({ title: p.title, summary: p.summary })
                      }
                    }
                  }
                  if (postData.length === 0) return
                  const res = await fetch('/api/admin/ai-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'intro', posts: postData }),
                  })
                  if (!res.ok) throw new Error('Fehler')
                  const data = await res.json()
                  if (data.text) onUpdate({ ...block, content: `<p>${data.text}</p>` })
                } catch (err) {
                  console.error('[AI intro]', err)
                } finally {
                  setGeneratingIntro(false)
                }
              }}
              disabled={generatingIntro}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary-600 hover:underline disabled:opacity-50"
            >
              {generatingIntro ? (
                <span className="animate-pulse">Generiere…</span>
              ) : (
                <>
                  <span>✨</span>
                  <span>Mit AI ausfüllen</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- Template Builder -------------------------------------------------

function TemplateBuilder({
  onSave,
  onCancel,
}: {
  onSave: (template: NewsletterTemplate) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [slots, setSlots] = useState<{ type: NewsletterBlock['type'] }[]>([])

  function addSlot(type: NewsletterBlock['type']) {
    setSlots([...slots, { type }])
  }

  function removeSlot(index: number) {
    setSlots(slots.filter((_, i) => i !== index))
  }

  function moveSlot(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= slots.length) return
    const next = [...slots]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSlots(next)
  }

  function handleSave() {
    if (!name.trim() || slots.length === 0) return
    onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      slots,
    })
  }

  const toolbarBtnCls =
    'rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-[var(--text)]">Neues Template erstellen</h3>

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--text)]">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mein Newsletter-Layout"
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--text)]">Blöcke hinzufügen</label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => addSlot('hero')} className={toolbarBtnCls}>+ Hero</button>
          <button onClick={() => addSlot('text')} className={toolbarBtnCls}>+ Freitext</button>
          <button onClick={() => addSlot('link-list')} className={toolbarBtnCls}>+ Link-Liste</button>
        </div>
      </div>

      {slots.length > 0 && (
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-4 py-2.5"
            >
              <span className="text-sm font-medium text-[var(--text)]">
                {i + 1}. {blockTypeLabels[slot.type]}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveSlot(i, -1)}
                  disabled={i === 0}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
                >
                  &uarr;
                </button>
                <button
                  onClick={() => moveSlot(i, 1)}
                  disabled={i === slots.length - 1}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
                >
                  &darr;
                </button>
                <button
                  onClick={() => removeSlot(i)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-6 text-center text-sm text-[var(--text-secondary)]">
          Füge oben Block-Typen hinzu, um dein Template zu definieren.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || slots.length === 0}
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:opacity-50"
        >
          Template speichern
        </button>
      </div>
    </div>
  )
}

// --- Preview Modal ----------------------------------------------------

function PreviewModal({
  html,
  onClose,
}: {
  html: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--background-elevated)] p-6 dark:bg-[var(--background-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Vorschau</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            Schliessen
          </button>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 ">
          <div
            className="mx-auto max-w-[600px]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}

// --- Trend Charts ------------------------------------------------------

export default function AdminNewsletter({ initialTab = 'dashboard', automationId }: { initialTab?: Tab; automationId?: number } = {}) {
  const [phase, setPhase] = useState<'checking' | 'login' | 'loaded'>('checking')
  const [tab, setTab] = useState<Tab>(initialTab)
  const setTabWithUrl = useCallback((newTab: Tab) => {
    setTab(newTab)
    window.history.pushState(null, '', tabToHref(newTab))
  }, [])

  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [sends, setSends] = useState<NewsletterSend[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const handlePopState = () => setTab(pathToTab(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('newsletter-dark-mode')
    if (saved === 'true') {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  function toggleDarkMode() {
    const next = !darkMode
    setDarkMode(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('newsletter-dark-mode', String(next))
  }

  // Compose state
  const [composeMode, setComposeMode] = useState<ComposeMode>('pick-template')
  const [selectedTemplate, setSelectedTemplate] = useState<NewsletterTemplate | null>(null)
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([])
  const [subject, setSubject] = useState('')
  const [generatingSubject, setGeneratingSubject] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [customTemplates, setCustomTemplates] = useState<NewsletterTemplate[]>([])
  const [drafts, setDrafts] = useState<NewsletterDraft[]>([])

  // Test send state
  const [showTestSend, setShowTestSend] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  // Reporting state
  const [sendTrends, setSendTrends] = useState<SendTrend[]>([])
  const [subscriberGrowth, setSubscriberGrowth] = useState<SubscriberGrowth[]>([])
  const [overallStats, setOverallStats] = useState<OverallStatsData | null>(null)

  const [automationFullscreen, setAutomationFullscreen] = useState(false)

  const confirmedCount = subscribers.filter((s) => s.status === 'confirmed').length
  const canSend = subject.trim() !== '' && blocksAreValid(blocks) && confirmedCount > 0

  useEffect(() => {
    setCustomTemplates(loadCustomTemplates())
    setDrafts(loadDrafts())
  }, [])

  async function loadData() {
    try {
      const res = await fetch('/api/admin/newsletter?posts=1&stats=1')
      if (res.status === 401) {
        setPhase('login')
        return
      }
      const data = await res.json()
      setSubscribers(data.subscribers || [])
      setSends(data.sends || [])
      setPosts(data.posts || [])
      setOverallStats(data.overallStats || null)
      setPhase('loaded')
    } catch {
      setPhase('login')
    }
  }

  async function loadTrends() {
    try {
      const res = await fetch('/api/admin/newsletter-trends')
      if (!res.ok) return
      const data = await res.json()
      setSendTrends(data.trends || [])
      setSubscriberGrowth(data.subscriberGrowth || [])
    } catch {
      // ignore
    }
  }

  async function streamingSend(
    body: object,
    onProgress: (data: { sent: number; total: number; remaining: number }) => void
  ): Promise<{ sent: number; total: number }> {
    const res = await fetch('/api/admin/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Fehler beim Versenden.')
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastData = { sent: 0, total: 0 }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        const data = JSON.parse(line)
        lastData = data
        if (!data.done) onProgress(data)
      }
    }

    return lastData
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if ((tab === 'history' || tab === 'dashboard') && sendTrends.length === 0) {
      loadTrends()
    }
  }, [tab])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(timer)
  }, [toast])

  function selectTemplate(template: NewsletterTemplate) {
    setSelectedTemplate(template)
    setBlocks(blocksFromTemplate(template))
    setSubject('')
    setComposeMode('fill-slots')
  }

  function goBackToPicker() {
    setSelectedTemplate(null)
    setBlocks([])
    setSubject('')
    setComposeMode('pick-template')
  }

  async function generateSubject() {
    setGeneratingSubject(true)
    try {
      const postData: Array<{ title: string; summary: string }> = []
      for (const block of blocks) {
        if (block.type === 'hero' && block.slug) {
          const p = posts.find((x) => x.slug === block.slug)
          if (p) postData.push({ title: p.title, summary: p.summary })
        }
        if (block.type === 'link-list') {
          for (const s of block.slugs) {
            const p = posts.find((x) => x.slug === s)
            if (p) postData.push({ title: p.title, summary: p.summary })
          }
        }
      }
      if (postData.length === 0) return
      const res = await fetch('/api/admin/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subject', posts: postData }),
      })
      if (!res.ok) throw new Error('Fehler beim Generieren')
      const data = await res.json()
      if (data.text) setSubject(data.text)
    } catch (err) {
      console.error('[generateSubject]', err)
    } finally {
      setGeneratingSubject(false)
    }
  }

  function updateBlock(index: number, updated: NewsletterBlock) {
    const next = [...blocks]
    next[index] = updated
    setBlocks(next)
  }

  function removeBlock(index: number) {
    setBlocks(blocks.filter((_, i) => i !== index))
  }

  function moveBlock(from: number, to: number) {
    if (from === to) return
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setBlocks(next)
  }

  function insertBlock(type: UserAuthoredBlockType, at: number) {
    const next = [...blocks]
    next.splice(at, 0, createBlock(type))
    setBlocks(next)
  }

  function handleSaveCustomTemplate(template: NewsletterTemplate) {
    const updated = [...customTemplates, template]
    setCustomTemplates(updated)
    saveCustomTemplates(updated)
    setComposeMode('pick-template')
  }

  function handleDeleteCustomTemplate(id: string) {
    setConfirmAction({
      title: 'Template löschen',
      message: 'Template wirklich löschen?',
      onConfirm: () => {
        setConfirmAction(null)
        const updated = customTemplates.filter((t) => t.id !== id)
        setCustomTemplates(updated)
        saveCustomTemplates(updated)
        setToast({ type: 'success', message: 'Template gelöscht.' })
      },
    })
  }

  function handleSaveDraft() {
    const draft: NewsletterDraft = {
      id: crypto.randomUUID(),
      subject,
      blocks,
      templateId: selectedTemplate?.id ?? null,
      savedAt: new Date().toISOString(),
    }
    const updated = [draft, ...drafts]
    setDrafts(updated)
    saveDrafts(updated)
    setToast({ type: 'success', message: 'Entwurf gespeichert.' })
  }

  function handleLoadDraft(draft: NewsletterDraft) {
    const template = [...BUILT_IN_TEMPLATES, ...customTemplates].find((t) => t.id === draft.templateId) ?? BUILT_IN_TEMPLATES[0]
    setSelectedTemplate(template)
    setBlocks(draft.blocks)
    setSubject(draft.subject)
    setComposeMode('fill-slots')
  }

  function handleDeleteDraft(id: string) {
    const updated = drafts.filter((d) => d.id !== id)
    setDrafts(updated)
    saveDrafts(updated)
    setToast({ type: 'success', message: 'Entwurf gelöscht.' })
  }

  function handleSendClick() {
    if (!canSend) return
    setConfirmSend(true)
  }

  async function handleTestSendConfirmed() {
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
        setToast({ type: 'success', message: `Test-Newsletter an ${testEmail.trim()} gesendet.` })
      } else {
        setToast({ type: 'error', message: data.error || 'Testversand fehlgeschlagen.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
    } finally {
      setSending(false)
    }
  }

  async function handleSendConfirmed() {
    setConfirmSend(false)
    setSending(true)
    try {
      const result = await streamingSend(
        { action: 'send', subject, blocks },
        ({ sent, total }) => setToast({ type: 'info', message: `${sent} von ${total} gesendet…` })
      )
      setToast({ type: 'success', message: `Erfolgreich an ${result.sent} Empfänger versendet.` })
      goBackToPicker()
      loadData()
    } catch (err: unknown) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    } finally {
      setSending(false)
    }
  }

  if (phase === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-primary-500" />
          <p className="text-sm text-[var(--text-muted)]">Laden…</p>
        </div>
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoginForm onLogin={loadData} />
      </div>
    )
  }

  const sidebarItems: { id: Tab; label: string; href: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard', label: 'Dashboard', href: '/admin/newsletter',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
    },
    {
      id: 'compose', label: 'Erstellen', href: '/admin/newsletter/compose',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>,
    },
    {
      id: 'subscribers', label: 'Abonnenten', href: '/admin/newsletter/subscribers',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77M12 15.07a5.98 5.98 0 00-1.654-.76M15 19.128H5.228A2 2 0 013 17.16V17" /></svg>,
    },
    {
      id: 'history', label: 'Historie', href: '/admin/newsletter/history',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    },
    {
      id: 'settings', label: 'Settings', href: '/admin/newsletter/settings',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      id: 'automations', label: 'Automation', href: '/admin/newsletter/automations',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
    },
  ]

  const postsMap = buildPostsMap(blocks, posts)

  return (
    <div className="flex h-screen">
      {/* ── Sidebar ──────────────────────────────────── */}
      <nav className={`glass-sidebar flex shrink-0 flex-col py-4 ${sidebarOpen ? 'expanded' : ''}`} style={{ width: sidebarOpen ? 180 : 56 }}>
        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', background: 'none', border: 'none', cursor: 'pointer', margin: '0 auto 20px', transition: 'color 0.1s' }}
          title={sidebarOpen ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {sidebarOpen
              ? <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            }
          </svg>
        </button>

        {/* Nav Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
          {sidebarItems.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.button === 1) return
                e.preventDefault()
                setTabWithUrl(item.id)
              }}
              className={`sidebar-icon${tab === item.id ? ' active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              {item.icon}
              <span className="sidebar-label">{item.label}</span>
            </a>
          ))}
        </div>

        {/* Bottom: Dark mode toggle */}
        <div style={{ marginTop: 'auto', padding: '0 8px' }}>
          <button
            onClick={toggleDarkMode}
            className="sidebar-icon"
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            style={{ width: sidebarOpen ? '100%' : 40, justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? '0 12px' : 0, gap: sidebarOpen ? 10 : 0 }}
          >
            {darkMode ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
            {sidebarOpen && <span className="sidebar-label" style={{ display: 'block', opacity: 1 }}>{darkMode ? 'Light' : 'Dark'}</span>}
          </button>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────── */}
      <div className={`flex-1 ${automationFullscreen ? '' : 'overflow-y-auto'}`}>
        {/* Automation fullscreen — no container constraints */}
        {automationFullscreen && tab === 'automations' && (
          <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
        )}

        <div className={`mx-auto max-w-[1100px] space-y-6 p-6 ${automationFullscreen ? 'hidden' : ''}`}>
      {/* --- Dashboard Tab ----------------------------------------- */}
      {tab === 'dashboard' && (
        <DashboardTab
          subscribers={subscribers}
          sends={sends}
          overallStats={overallStats}
          subscriberGrowth={subscriberGrowth}
          sendTrends={sendTrends}
          setTab={setTabWithUrl}

          EngagementTrendChart={EngagementTrendChart}
          SubscriberGrowthChart={SubscriberGrowthChart}
        />
      )}

      {/* --- Compose Tab ------------------------------------------- */}
      {tab === 'compose' && (
        <div className="glass-card space-y-5 rounded-xl p-6">
          {/* Mode: Pick Template */}
          {composeMode === 'pick-template' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium text-[var(--text)]">Template wählen</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {BUILT_IN_TEMPLATES.map((t) => (
                    <TemplateCard key={t.id} template={t} onSelect={() => selectTemplate(t)} />
                  ))}
                </div>
              </div>

              {(customTemplates.length > 0) && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Eigene Templates</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {customTemplates.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onSelect={() => selectTemplate(t)}
                        onDelete={() => handleDeleteCustomTemplate(t.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {drafts.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Gespeicherte Entwürfe</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="space-y-2">
                    {drafts.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background-card)] px-4 py-3 transition-colors hover:border-primary-300 "
                      >
                        <button
                          onClick={() => handleLoadDraft(d)}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-medium text-[var(--text)]">
                            {d.subject || 'Ohne Betreff'}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {d.blocks.length} Block{d.blocks.length !== 1 ? 'e' : ''} · {formatDate(d.savedAt)}
                          </div>
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(d.id)}
                          className="ml-3 text-xs text-red-500 hover:text-red-700"
                        >
                          Löschen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setComposeMode('build-template')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
              >
                <span className="text-lg">+</span> Neues Template erstellen
              </button>
            </div>
          )}

          {/* Mode: Build Template */}
          {composeMode === 'build-template' && (
            <TemplateBuilder
              onSave={handleSaveCustomTemplate}
              onCancel={() => setComposeMode('pick-template')}
            />
          )}

          {/* Mode: Fill Slots */}
          {composeMode === 'fill-slots' && selectedTemplate && (() => {
            const usedSlugs = getUsedSlugs(blocks)
            return (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--text)]">
                  Template: <span className="font-semibold">"{selectedTemplate.name}"</span>
                </h3>
                <button
                  onClick={goBackToPicker}
                  className="rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  &larr; Andere wählen
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">Betreffzeile</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Newsletter-Betreff…"
                    className={inputCls + ' flex-1'}
                  />
                  <button
                    onClick={generateSubject}
                    disabled={generatingSubject || blocks.length === 0}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                  >
                    {generatingSubject ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <span>✨</span>
                    )}
                    {generatingSubject ? 'Generiere…' : 'Mit AI ausfüllen'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
                {/* Left: Template slots */}
                <div className="space-y-1">
                  <InsertToolbar onInsert={(type) => insertBlock(type, 0)} alwaysExpanded={blocks.length === 0} />
                  {blocks.map((block, i) => (
                    <React.Fragment key={block.id}>
                      <SlotCard
                        block={block}
                        index={i}
                        posts={posts}
                        allBlocks={blocks}
                        onUpdate={(updated) => updateBlock(i, updated)}
                        onRemove={() => removeBlock(i)}
                        onMove={moveBlock}
                      />
                      <InsertToolbar onInsert={(type) => insertBlock(type, i + 1)} alwaysExpanded={i === blocks.length - 1} />
                    </React.Fragment>
                  ))}
                </div>

                {/* Right: Draggable article list */}
                <div className="lg:sticky lg:top-4 lg:self-start">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)]">
                        Artikel (Drag &amp; Drop)
                      </h4>
                      <button
                        onClick={async () => {
                          setToast({ type: 'info', message: 'Artikel werden synchronisiert…' })
                          try {
                            const res = await fetch('/api/admin/newsletter', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'sync-content' }),
                            })
                            const data = await res.json()
                            if (res.ok) {
                              setToast({ type: 'success', message: `${data.synced} Artikel synchronisiert.` })
                              loadData()
                            } else {
                              setToast({ type: 'error', message: data.error || 'Sync fehlgeschlagen.' })
                            }
                          } catch {
                            setToast({ type: 'error', message: 'Sync fehlgeschlagen.' })
                          }
                        }}
                        className="text-[10px] text-primary-600 hover:underline"
                        title="Artikel aus kokomo2026 synchronisieren"
                      >
                        Aktualisieren
                      </button>
                    </div>
                    <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                      {posts.slice(0, 20).map((post) => (
                        <DraggablePostItem
                          key={post.slug}
                          post={post}
                          isUsed={usedSlugs.has(post.slug)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={blocks.length === 0}
                  className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                >
                  Entwurf speichern
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!blocksAreValid(blocks)}
                  className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                >
                  Vorschau
                </button>
                <button
                  onClick={() => setShowTestSend(true)}
                  disabled={sending || !subject.trim() || !blocksAreValid(blocks)}
                  className="rounded-full border border-amber-400 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
                >
                  Test senden
                </button>
                <button
                  onClick={handleSendClick}
                  disabled={sending || !canSend}
                  className="flex-1 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:opacity-50"
                >
                  {sending
                    ? 'Wird versendet…'
                    : `An ${confirmedCount} Abonnent${confirmedCount !== 1 ? 'en' : ''} senden`}
                </button>
              </div>
            </div>
            )
          })()}

        </div>
      )}

      {/* Preview Modal */}
      {showPreview && blocksAreValid(blocks) && (
        <PreviewModal
          html={buildMultiBlockNewsletterHtml(PREVIEW_SITE_CONFIG, blocks, postsMap, '#')}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* --- Subscribers Tab --------------------------------------- */}
      {/* --- Subscribers Tab --------------------------------------- */}
      {tab === 'subscribers' && (
        <SubscribersTab
          subscribers={subscribers}
          setConfirmAction={setConfirmAction}
          setToast={setToast}
          loadData={loadData}
        />
      )}

      {/* --- History / Reporting Tab ------------------------------- */}
      {/* --- History Tab ------------------------------------------- */}
      {tab === 'history' && (
        <HistoryTab
          sends={sends}
          posts={posts}
          sendTrends={sendTrends}
          subscriberGrowth={subscriberGrowth}
          overallStats={overallStats}
          siteConfig={PREVIEW_SITE_CONFIG}
          setToast={setToast}
          loadData={loadData}
          streamingSend={streamingSend}
        />
      )}

      {/* --- Settings Tab -------------------------------------------- */}
      {/* --- Settings Tab ------------------------------------------ */}
      {tab === 'settings' && (
        <SettingsTab setToast={setToast} />
      )}

      {/* --- Automations Tab (non-fullscreen = list view) --------- */}
      {tab === 'automations' && !automationFullscreen && (
        <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
      )}

      {/* --- Toast ----------------------------------------------- */}
      {toast && (
        <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none">
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-5 py-3 shadow-xl backdrop-blur-md ${
              toast.type === 'success'
                ? 'border-emerald-200/60 bg-emerald-50/90 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/80 dark:text-emerald-200'
                : toast.type === 'info'
                  ? 'border-blue-200/60 bg-blue-50/90 text-blue-800 dark:border-blue-700/60 dark:bg-blue-900/80 dark:text-blue-200'
                  : 'border-red-200/60 bg-red-50/90 text-red-800 dark:border-red-700/60 dark:bg-red-900/80 dark:text-red-200'
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-1 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* --- Confirm Send Modal --------------------------------- */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Newsletter versenden</h3>
            <p className="mb-1 text-sm text-[var(--text-secondary)]">
              Bist du sicher, dass du den Newsletter versenden möchtest?
            </p>
            <p className="mb-6 text-sm font-medium text-[var(--text)]">
              &laquo;{subject}&raquo; an {confirmedCount} Abonnent{confirmedCount !== 1 ? 'en' : ''}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSend(false)}
                className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSendConfirmed}
                className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                Jetzt senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Test Send Modal ------------------------------------ */}
      {showTestSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Test-Newsletter senden</h3>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              &laquo;[TEST] {subject}&raquo; wird an diese Adresse gesendet:
            </p>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && testEmail.trim()) handleTestSendConfirmed() }}
              placeholder="test@example.com"
              autoFocus
              className={inputCls + ' mb-6'}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowTestSend(false)}
                className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Abbrechen
              </button>
              <button
                onClick={handleTestSendConfirmed}
                disabled={!testEmail.trim()}
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                Test senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Generic Confirm Modal ------------------------------ */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">{confirmAction.title}</h3>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">{confirmAction.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="glass-button"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

        </div>{/* /max-w content */}
      </div>{/* /overflow-y-auto */}
    </div>
  )
}
