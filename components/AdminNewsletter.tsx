'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from 'react'
import TiptapEditor from './TiptapEditor'
import AutomationEditor from './AutomationEditor'
import DashboardTab from './admin/DashboardTab'
import SubscribersTab from './admin/SubscribersTab'
import ListsTab from './admin/ListsTab'
import SettingsTab from './admin/SettingsTab'
import HistoryTab from './admin/HistoryTab'
import BouncesTab from './admin/BouncesTab'
import EmailTemplatesTab from './admin/EmailTemplatesTab'
import LoginForm from './admin/LoginForm'
import { useToast } from './ui/ToastProvider'
import StatusPill from './ui/StatusPill'
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
import type { EngagementPrediction } from '@/lib/engagement-prediction'

// --- Types -------------------------------------------------------------

interface Subscriber {
  id: number
  email: string
  status: 'pending' | 'confirmed' | 'unsubscribed'
  createdAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  engagement_score?: number | null
  engagement_tier?: 'active' | 'moderate' | 'dormant' | 'cold' | null
  tags?: string[]
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

type Tab = 'dashboard' | 'compose' | 'subscribers' | 'lists' | 'history' | 'bounces' | 'settings' | 'automations' | 'emails'

function tabToHref(tab: Tab): string {
  return tab === 'dashboard' ? '/admin/newsletter' : `/admin/newsletter/${tab}`
}

function pathToTab(pathname: string): Tab {
  const segment = pathname.replace('/admin/newsletter', '').replace(/^\//, '').split('/')[0]
  if (!segment) return 'dashboard'
  const tabs: Tab[] = ['compose', 'subscribers', 'lists', 'history', 'bounces', 'settings', 'automations']
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

// `<input type="datetime-local">` returns "YYYY-MM-DDTHH:mm" without timezone —
// browser interprets it as local time. Construct a Date so the value matches
// what the user sees in their picker (then we serialize to UTC for the API).
function parseScheduleLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000) // +1h
  d.setMinutes(0, 0, 0)
  // Serialize as YYYY-MM-DDTHH:mm in local TZ for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

// --- Engagement Panel --------------------------------------------------

export type AudienceMode = 'all' | 'engaged' | 'high'
export interface AudienceFilter {
  mode: AudienceMode
  tags: string[]
  count: number
}

function EngagementPanel({
  slugs,
  audienceMode,
  onAudienceChange,
}: {
  slugs: string[]
  audienceMode: AudienceMode
  onAudienceChange: (filter: AudienceFilter | null) => void
}) {
  const slugKey = useMemo(() => [...new Set(slugs)].sort().join('|'), [slugs])
  const [prediction, setPrediction] = useState<EngagementPrediction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (slugKey === '') {
      setPrediction(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/engagement-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugs: slugKey.split('|') }),
        })
        if (cancelled) return
        if (!res.ok) {
          setError('Prognose konnte nicht geladen werden.')
          setPrediction(null)
        } else {
          const data = (await res.json()) as EngagementPrediction
          setPrediction(data)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setError('Prognose konnte nicht geladen werden.')
          setPrediction(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [slugKey])

  if (slugKey === '') return null

  const high = prediction?.buckets.find((b) => b.level === 'high')
  const medium = prediction?.buckets.find((b) => b.level === 'medium')
  const cold = prediction?.buckets.find((b) => b.level === 'cold')
  const total = prediction?.totalConfirmed ?? 0
  const reachedAny = (high?.count ?? 0) + (medium?.count ?? 0)
  const reachPct = total > 0 ? Math.round((reachedAny / total) * 100) : 0
  const noTags = prediction !== null && prediction.tags.length === 0
  const noSignals = prediction !== null && prediction.tags.length > 0 && reachedAny === 0

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text)]">Engagement-Prognose</span>
          {loading && (
            <svg className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        {prediction && prediction.tags.length > 0 && (
          <span className="text-xs text-[var(--text-secondary)]">
            Tags: {prediction.tags.join(', ')}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {noTags && (
        <p className="text-xs text-[var(--text-secondary)]">
          Diese Artikel haben (noch) keine Tags — Prognose nicht möglich.
        </p>
      )}

      {prediction && prediction.tags.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <BucketCard
              dotClass="bg-emerald-500"
              label="Hoch interessiert"
              count={high?.count ?? 0}
              hint={high && high.count > 0 ? `ø ${high.avgSignal.toFixed(1)} Klicks` : '—'}
            />
            <BucketCard
              dotClass="bg-amber-500"
              label="Eher interessiert"
              count={medium?.count ?? 0}
              hint={medium && medium.count > 0 ? `ø ${medium.avgSignal.toFixed(1)} Klicks` : '—'}
            />
            <BucketCard
              dotClass="bg-[var(--border)]"
              label="Wenig Signal"
              count={cold?.count ?? 0}
              hint="keine Klicks zu diesen Tags"
            />
          </div>

          {prediction.byTag.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prediction.byTag.map((t) => (
                <span
                  key={t.tag}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--background-elevated)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  <span className="font-medium text-[var(--text)]">{t.tag}</span>
                  <span className="opacity-60">·</span>
                  <span>{t.interestedCount}</span>
                </span>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {noSignals
              ? 'Noch keine Klick-Historie zu diesen Tags. Erste Sendungen sind ein Blindflug — danach wird die Prognose schärfer.'
              : `${reachPct}% deiner ${total} Abonnenten zeigten in der Vergangenheit Interesse an mindestens einem dieser Tags.`}
          </p>

          <AudienceSelector
            mode={audienceMode}
            allCount={total}
            engagedCount={reachedAny}
            highCount={high?.count ?? 0}
            tags={prediction.tags}
            onChange={onAudienceChange}
          />

          <SimilarSendsBlock stats={prediction.similarSends} />
        </>
      )}
    </div>
  )
}

function AudienceSelector({
  mode,
  allCount,
  engagedCount,
  highCount,
  tags,
  onChange,
}: {
  mode: AudienceMode
  allCount: number
  engagedCount: number
  highCount: number
  tags: string[]
  onChange: (filter: AudienceFilter | null) => void
}) {
  // Keep parent in sync if a non-default mode is active and counts shift
  // (e.g. after the prediction refreshed because tags changed)
  useEffect(() => {
    if (mode === 'all') return
    const count = mode === 'high' ? highCount : engagedCount
    onChange({ mode, tags, count })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, highCount, engagedCount, tags.join('|')])

  const buttons: Array<{ key: AudienceMode; label: string; count: number; disabled: boolean }> = [
    { key: 'all', label: 'Alle', count: allCount, disabled: false },
    { key: 'engaged', label: 'Mit Interesse', count: engagedCount, disabled: engagedCount === 0 },
    { key: 'high', label: 'Nur hoch', count: highCount, disabled: highCount === 0 },
  ]

  function selectMode(next: AudienceMode) {
    if (next === 'all') {
      onChange(null)
      return
    }
    const count = next === 'high' ? highCount : engagedCount
    onChange({ mode: next, tags, count })
  }

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        Empfängerkreis
      </div>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => {
          const active = mode === b.key
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => !b.disabled && selectMode(b.key)}
              disabled={b.disabled}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
                (active
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-[var(--border)] bg-[var(--background-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]')
              }
            >
              {b.label} <span className={active ? 'opacity-90' : 'opacity-60'}>· {b.count}</span>
            </button>
          )
        })}
      </div>
      {mode !== 'all' && (
        <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
          Versand nur an Abonnenten, deren Klick-Historie zu diesen Tags passt.
        </p>
      )}
    </div>
  )
}

function SimilarSendsBlock({ stats }: { stats: EngagementPrediction['similarSends'] }) {
  if (stats.sampleSize === 0) return null
  const lowSample = stats.sampleSize < 3
  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          Ähnliche Sendungen
        </span>
        <span className="text-[11px] text-[var(--text-secondary)]">
          n = {stats.sampleSize}{lowSample ? ' · sehr klein' : ''}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-[var(--text)]">{stats.avgClickRate.toFixed(1)}%</span>
        <span className="text-xs text-[var(--text-secondary)]">ø Klickrate</span>
      </div>
      {stats.examples.length > 0 && (
        <ul className="mt-2 space-y-1">
          {stats.examples.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-[var(--text-secondary)]">{ex.subject}</span>
              <span className="shrink-0 text-[var(--text)]">{ex.clickRate.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      )}
      {lowSample && (
        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
          Wenige vergleichbare Sendungen — Aussagekraft begrenzt.
        </p>
      )}
    </div>
  )
}

function BucketCard({ dotClass, label, count, hint }: { dotClass: string; label: string; count: number; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className="text-xl font-semibold text-[var(--text)]">{count}</div>
      <div className="text-[11px] text-[var(--text-secondary)]">{hint}</div>
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
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])
  const [showSubjectPicker, setShowSubjectPicker] = useState(false)
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter | null>(null)
  const [sending, setSending] = useState(false)
  const toast = useToast()
  const [showPreview, setShowPreview] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [customTemplates, setCustomTemplates] = useState<NewsletterTemplate[]>([])
  const [drafts, setDrafts] = useState<NewsletterDraft[]>([])

  // Test send state
  const [showTestSend, setShowTestSend] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  // Send-Time Optimization
  const [useSto, setUseSto] = useState(false)

  // Geplanter Versand
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduleLocal, setScheduleLocal] = useState('') // datetime-local value

  // Empfänger-Listen (manuelle Listen)
  const [availableLists, setAvailableLists] = useState<{ id: number; name: string; member_count: number }[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)

  // Reporting state
  const [sendTrends, setSendTrends] = useState<SendTrend[]>([])
  const [subscriberGrowth, setSubscriberGrowth] = useState<SubscriberGrowth[]>([])
  const [overallStats, setOverallStats] = useState<OverallStatsData | null>(null)

  const [automationFullscreen, setAutomationFullscreen] = useState(false)

  const confirmedCount = subscribers.filter((s) => s.status === 'confirmed').length
  const selectedList = selectedListId ? availableLists.find((l) => l.id === selectedListId) : null
  const audienceCount = selectedList
    ? selectedList.member_count
    : (audienceFilter ? audienceFilter.count : confirmedCount)
  const canSend = subject.trim() !== '' && blocksAreValid(blocks) && audienceCount > 0
  const usedSlugsKey = useMemo(
    () => [...new Set([...getUsedSlugs(blocks)])].sort().join('|'),
    [blocks],
  )

  useEffect(() => {
    setCustomTemplates(loadCustomTemplates())
    setDrafts(loadDrafts())
  }, [])

  useEffect(() => {
    if (tab !== 'compose') return
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
  }, [tab])

  useEffect(() => {
    // Reset audience filter whenever the post selection changes — the cached
    // count would otherwise drift from the actual segment for the new tag set.
    setAudienceFilter(null)
  }, [usedSlugsKey])

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
    setSubjectOptions([])
    setShowSubjectPicker(true)
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
        toast.success('Template gelöscht.')
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
    toast.success('Entwurf gespeichert.')
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
    toast.success('Entwurf gelöscht.')
  }

  function handleSendClick() {
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
        toast.success(`Test-Newsletter an ${testEmail.trim()} gesendet.`)
      } else {
        toast.error(data.error || 'Testversand fehlgeschlagen.')
      }
    } catch {
      toast.error('Verbindung fehlgeschlagen.')
    } finally {
      setSending(false)
    }
  }

  async function handleSendConfirmed() {
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
          ({ sent, total }) => toast.info(`${sent} von ${total} gesendet…`)
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
      id: 'lists', label: 'Listen', href: '/admin/newsletter/lists',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>,
    },
    {
      id: 'history', label: 'Historie', href: '/admin/newsletter/history',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    },
    {
      id: 'bounces', label: 'Bounces', href: '/admin/newsletter/bounces',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.5h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      id: 'settings', label: 'Settings', href: '/admin/newsletter/settings',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      id: 'automations', label: 'Automation', href: '/admin/newsletter/automations',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
    },
    {
      id: 'emails', label: 'Templates', href: '/admin/newsletter/emails',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
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
      <div className="flex justify-end">
        <StatusPill />
      </div>
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

              <EngagementPanel
                slugs={[...usedSlugs]}
                audienceMode={audienceFilter?.mode ?? 'all'}
                onAudienceChange={setAudienceFilter}
              />

              {availableLists.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">Empfänger aus Liste</span>
                    {selectedListId !== null && (
                      <button
                        onClick={() => setSelectedListId(null)}
                        className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text)]"
                      >
                        Liste deaktivieren
                      </button>
                    )}
                  </div>
                  <p className="mb-3 text-xs text-[var(--text-muted)]">
                    Statt an alle Abonnenten geht der Newsletter nur an die Mitglieder dieser Liste. Praktisch für Tests.
                  </p>
                  <select
                    value={selectedListId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setSelectedListId(v === '' ? null : parseInt(v, 10))
                      if (v !== '') setAudienceFilter(null)
                    }}
                    className={inputCls + ' w-full'}
                  >
                    <option value="">— Alle Abonnenten / Segment —</option>
                    {availableLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.member_count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                          toast.info('Artikel werden synchronisiert…')
                          try {
                            const res = await fetch('/api/admin/newsletter', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'sync-content' }),
                            })
                            const data = await res.json()
                            if (res.ok) {
                              toast.success(`${data.synced} Artikel synchronisiert.`)
                              loadData()
                            } else {
                              toast.error(data.error || 'Sync fehlgeschlagen.')
                            }
                          } catch {
                            toast.error('Sync fehlgeschlagen.')
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

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <span className="mb-3 block text-sm font-medium text-[var(--text)]">Versand-Zeitpunkt</span>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={scheduleMode === 'now'}
                      onChange={() => setScheduleMode('now')}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text)]">Sofort senden</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="schedule-mode"
                      checked={scheduleMode === 'scheduled'}
                      onChange={() => {
                        setScheduleMode('scheduled')
                        if (!scheduleLocal) setScheduleLocal(defaultScheduleValue())
                      }}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-sm text-[var(--text)]">Geplant für…</span>
                  </label>
                  {scheduleMode === 'scheduled' && (
                    <div className="ml-7 mt-2 space-y-1">
                      <input
                        type="datetime-local"
                        value={scheduleLocal}
                        onChange={(e) => setScheduleLocal(e.target.value)}
                        className={inputCls + ' w-full max-w-xs'}
                      />
                      <p className="text-xs text-[var(--text-muted)]">
                        Versand erfolgt zum gewählten Zeitpunkt (lokale Zeit). Resend übernimmt das Queueing.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <input
                  type="checkbox"
                  checked={useSto}
                  onChange={(e) => setUseSto(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--text)]">Send-Time Optimization</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {scheduleMode === 'scheduled'
                      ? 'Ab dem geplanten Zeitpunkt: Empfänger mit Profil bekommen die Mail zu ihrer Lieblingszeit nach diesem Termin. Alle anderen erhalten sie genau zum geplanten Zeitpunkt.'
                      : 'Empfänger mit Profil bekommen die Mail zu ihrer persönlichen Lieblingszeit (gelernt aus bisherigen Öffnungen). Alle anderen erhalten sie sofort.'}
                  </span>
                </span>
              </label>

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
                    ? (scheduleMode === 'scheduled' ? 'Wird geplant…' : 'Wird versendet…')
                    : `${scheduleMode === 'scheduled' ? 'Versand planen' : 'Senden'} • ${audienceCount} Abonnent${audienceCount !== 1 ? 'en' : ''}${audienceFilter ? ' (Segment)' : ''}`}
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
      {tab === 'subscribers' && (
        <SubscribersTab
          subscribers={subscribers}
          setConfirmAction={setConfirmAction}
          loadData={loadData}
        />
      )}

      {/* --- Lists Tab ---------------------------------------------- */}
      {tab === 'lists' && (
        <ListsTab />
      )}

      {/* --- History Tab ------------------------------------------- */}
      {tab === 'history' && (
        <HistoryTab
          sends={sends}
          posts={posts}
          sendTrends={sendTrends}
          subscriberGrowth={subscriberGrowth}
          overallStats={overallStats}
          siteConfig={PREVIEW_SITE_CONFIG}
          loadData={loadData}
          streamingSend={streamingSend}
        />
      )}

      {/* --- Bounces Tab ------------------------------------------- */}
      {tab === 'bounces' && (
        <BouncesTab />
      )}

      {/* --- Settings Tab ------------------------------------------ */}
      {tab === 'settings' && (
        <SettingsTab />
      )}

      {/* --- Automations Tab (non-fullscreen = list view) --------- */}
      {tab === 'automations' && !automationFullscreen && (
        <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} initialAutomationId={automationId} />
      )}

      {/* --- Email Templates Tab --------------------------------- */}
      {tab === 'emails' && (
        <EmailTemplatesTab />
      )}


      {/* --- Confirm Send Modal --------------------------------- */}
      {confirmSend && (() => {
        const scheduledDate = scheduleMode === 'scheduled' ? parseScheduleLocal(scheduleLocal) : null
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">
              {scheduledDate ? 'Newsletter planen' : 'Newsletter versenden'}
            </h3>
            <p className="mb-1 text-sm text-[var(--text-secondary)]">
              {scheduledDate
                ? 'Bist du sicher, dass du den Newsletter zum gewählten Zeitpunkt verschicken möchtest?'
                : 'Bist du sicher, dass du den Newsletter versenden möchtest?'}
            </p>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">
              &laquo;{subject}&raquo; an {audienceCount} Abonnent{audienceCount !== 1 ? 'en' : ''}
            </p>
            {scheduledDate && (
              <p className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                Geplant für: <span className="font-medium text-[var(--text)]">
                  {scheduledDate.toLocaleString('de-CH', { dateStyle: 'long', timeStyle: 'short' })}
                </span>
                {useSto && (
                  <span className="mt-1 block text-[var(--text-muted)]">
                    Mit Send-Time Optimization — Empfänger ohne Profil bekommen die Mail genau zu diesem Zeitpunkt, mit Profil zur persönlichen Lieblingszeit danach.
                  </span>
                )}
              </p>
            )}
            {audienceFilter && (
              <p className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                Segment: <span className="font-medium text-[var(--text)]">
                  {audienceFilter.mode === 'high' ? 'Nur hoch interessiert' : 'Mit Interesse an diesen Tags'}
                </span>
                {' '}({audienceFilter.tags.join(', ')})
              </p>
            )}
            {!audienceFilter && !scheduledDate && <div className="mb-6" />}
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
                {scheduledDate ? 'Versand planen' : 'Jetzt senden'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

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

      {/* --- Subject Picker Modal ------------------------------- */}
      {showSubjectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Betreffzeile wählen</h3>
              <button
                onClick={() => setShowSubjectPicker(false)}
                className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                aria-label="Schliessen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {generatingSubject && subjectOptions.length === 0 ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
                  />
                ))}
              </div>
            ) : (
              <ul className="space-y-2">
                {subjectOptions.map((option, i) => (
                  <li key={i}>
                    <button
                      onClick={() => {
                        setSubject(option)
                        setShowSubjectPicker(false)
                      }}
                      className="group flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-left text-sm text-[var(--text)] transition-colors hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--background-elevated)] text-[10px] font-semibold text-[var(--text-secondary)] group-hover:bg-primary-600 group-hover:text-white">
                        {i + 1}
                      </span>
                      <span className="flex-1">{option}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={generateSubject}
                disabled={generatingSubject || blocks.length === 0}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
              >
                {generatingSubject ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <span>↻</span>
                )}
                {generatingSubject ? 'Generiere…' : 'Neu generieren'}
              </button>
              <button
                onClick={() => setShowSubjectPicker(false)}
                className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Abbrechen
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
