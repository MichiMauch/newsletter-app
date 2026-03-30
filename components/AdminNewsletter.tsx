'use client'

import React, { useState, useEffect, type FormEvent } from 'react'
import AutomationEditor from './AutomationEditor'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import type { SiteConfig } from '@/lib/site-config'
import {
  BUILT_IN_TEMPLATES,
  type NewsletterBlock,
  type NewsletterTemplate,
  type PostRef,
} from '@/lib/newsletter-blocks'

// Preview-only fallback config (used only for HTML preview in the admin)
const PREVIEW_SITE_CONFIG: SiteConfig = {
  id: 'preview',
  name: 'Newsletter',
  site_url: '',
  logo_url: null,
  primary_color: '#017734',
  accent_color: '#05DE66',
  gradient_end: '#01ABE7',
  font_family: 'Poppins',
  from_email: 'noreply@example.com',
  from_name: 'Newsletter',
  footer_text: null,
  social_links: {},
  allowed_origin: '',
  turnstile_site_key: null,
  locale: 'de-CH',
}

// --- Types -------------------------------------------------------------

interface Subscriber {
  id: number
  email: string
  status: 'pending' | 'confirmed' | 'unsubscribed'
  created_at: string
  confirmed_at: string | null
  unsubscribed_at: string | null
}

interface NewsletterSend {
  id: number
  post_slug: string
  post_title: string
  subject: string
  sent_at: string
  recipient_count: number
  delivered_count?: number
  opened_count?: number
  clicked_count?: number
  bounced_count?: number
  complained_count?: number
}

interface NewsletterRecipientRow {
  id: number
  email: string
  resend_email_id: string | null
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'
  delivered_at: string | null
  opened_at: string | null
  open_count: number
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
  avg_open_rate: number
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
  open_rate: number
  click_rate: number
  bounce_rate: number
}

interface SubscriberGrowth {
  month: string
  total: number
  new_count: number
}

type Tab = 'compose' | 'subscribers' | 'history' | 'settings' | 'automations'
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
    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
}

const blockTypeLabels: Record<NewsletterBlock['type'], string> = {
  hero: 'Hero',
  text: 'Freitext',
  'link-list': 'Link-Liste',
}

function createBlock(type: NewsletterBlock['type']): NewsletterBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'hero':
      return { id, type: 'hero', slug: '' }
    case 'text':
      return { id, type: 'text', content: '' }
    case 'link-list':
      return { id, type: 'link-list', slugs: [] }
  }
}

function blocksFromTemplate(template: NewsletterTemplate): NewsletterBlock[] {
  return template.slots.map((slot) => createBlock(slot.type))
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
  'w-full rounded-xl border border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-white'

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
      className={`flex cursor-grab items-center gap-3 rounded-lg border border-slate-200 bg-white/60 px-3 py-2 transition-all active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800/60 ${
        isUsed
          ? 'opacity-40'
          : 'hover:border-primary-300 hover:shadow-sm dark:hover:border-primary-600'
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
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400 dark:bg-slate-700 dark:text-slate-500">
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
            : 'border-slate-200 bg-white/50 dark:border-slate-700 dark:bg-slate-800/50'
        }`}
      >
        {label && (
          <div className="px-3 pt-2 text-xs font-medium text-[var(--text-secondary)]">{label}</div>
        )}
        <div className="flex items-center gap-3 p-3">
          {post.image ? (
            <img src={post.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400 dark:bg-slate-700">
              Bild
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--text)]">{post.title}</div>
            <div className="text-xs text-[var(--text-secondary)]">{formatDateShort(post.date)}</div>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
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
          : 'border-slate-300 text-[var(--text-secondary)] dark:border-slate-600'
      }`}
    >
      {label && <div className="mb-1 text-xs font-medium">{label}</div>}
      <div className="text-sm">Artikel hierher ziehen</div>
    </div>
  )
}

// --- Login Form -------------------------------------------------------

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        onLogin()
      } else {
        const data = await res.json()
        setError(data.error || 'Login fehlgeschlagen.')
      }
    } catch {
      setError('Verbindung fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="glass-card rounded-2xl p-8 shadow-lg">
        <h2 className="mb-6 text-center text-xl font-semibold text-[var(--text)]">Admin Login</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            required
            disabled={loading}
            className="w-full rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-50 dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-white dark:placeholder-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/30"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            required
            disabled={loading}
            className="w-full rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-50 dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-white dark:placeholder-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/30"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary-700px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-800 hover:shadow-md disabled:opacity-50 dark:bg-primary-600 dark:hover:bg-primary-500"
          >
            {loading ? 'Wird angemeldet…' : 'Anmelden'}
          </button>
        </form>
        {error && (
          <div className="mt-4 rounded-xl border border-red-200/50 bg-red-50/60 px-4 py-3 text-center text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
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
      <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-1 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  ),
  'link-list': (
    <div className="mb-1 space-y-0.5">
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-full rounded bg-primary-100 dark:bg-primary-900" />
      <div className="h-1.5 w-3/4 rounded bg-primary-100 dark:bg-primary-900" />
    </div>
  ),
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
      className="group relative flex flex-col rounded-xl border border-slate-200 bg-white/60 p-4 text-left transition-all hover:border-primary-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-primary-500"
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
      <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
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
  onInsert: (type: NewsletterBlock['type']) => void
  alwaysExpanded?: boolean
}) {
  const [open, setOpen] = useState(false)

  const btnCls =
    'rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

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
      <div className="h-px flex-1 border-t border-dashed border-slate-200 opacity-0 transition-opacity group-hover:opacity-100 dark:border-slate-700" />
      <button
        onClick={() => setOpen(true)}
        className="mx-2 flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400 opacity-40 transition-all hover:border-primary-400 hover:text-primary-500 group-hover:opacity-100 dark:border-slate-600 dark:text-slate-500"
        title="Block einfügen"
      >
        +
      </button>
      <div className="h-px flex-1 border-t border-dashed border-slate-200 opacity-0 transition-opacity group-hover:opacity-100 dark:border-slate-700" />
    </div>
  )
}

// --- Slot Card (for fill-slots view) ----------------------------------

function SlotCard({
  block,
  index,
  posts,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: NewsletterBlock
  index: number
  posts: Post[]
  onUpdate: (updated: NewsletterBlock) => void
  onRemove?: () => void
  onMove: (from: number, to: number) => void
}) {
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
      className={`relative rounded-xl border bg-white/50 p-4 dark:bg-slate-800/50 ${
        dragOver === 'above'
          ? 'border-t-primary-500 border-t-4 border-x-slate-200 border-b-slate-200 bg-primary-50/30 dark:border-x-slate-700 dark:border-b-slate-700 dark:bg-primary-900/10'
          : dragOver === 'below'
            ? 'border-b-primary-500 border-b-4 border-x-slate-200 border-t-slate-200 bg-primary-50/30 dark:border-x-slate-700 dark:border-t-slate-700 dark:bg-primary-900/10'
            : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="cursor-grab text-slate-400 active:cursor-grabbing dark:text-slate-500" title="Ziehen zum Umsortieren">&#x2807;</span>
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {blockTypeLabels[block.type]}
          </span>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
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
            className="w-full rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          >
            + Artikel hinzufügen
          </button>
        </div>
      )}

      {block.type === 'text' && (
        <textarea
          value={block.content}
          onChange={(e) => onUpdate({ ...block, content: e.target.value })}
          rows={4}
          placeholder="Freitext eingeben…"
          className={`${inputCls} resize-y`}
        />
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
    'rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'

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
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <span className="text-sm font-medium text-[var(--text)]">
                {i + 1}. {blockTypeLabels[slot.type]}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveSlot(i, -1)}
                  disabled={i === 0}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
                >
                  &uarr;
                </button>
                <button
                  onClick={() => moveSlot(i, 1)}
                  disabled={i === slots.length - 1}
                  className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700"
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
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-6 text-center text-sm text-[var(--text-secondary)] dark:border-slate-600">
          Füge oben Block-Typen hinzu, um dein Template zu definieren.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || slots.length === 0}
          className="rounded-full bg-primary-700px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-800 hover:shadow-md disabled:opacity-50"
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
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Vorschau</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Schliessen
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
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

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mär', '04': 'Apr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Dez',
}

function EngagementTrendChart({ trends }: { trends: SendTrend[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (trends.length < 2) return null

  const chartHeight = 180
  const paddingLeft = 36
  const paddingRight = 12
  const paddingTop = 16
  const paddingBottom = 32
  const innerHeight = chartHeight - paddingTop - paddingBottom
  const maxRate = Math.max(
    ...trends.map((t) => t.click_rate),
    10
  )
  // Round up to next nice number
  const yMax = Math.ceil(maxRate / 10) * 10

  const pointSpacing = trends.length > 1 ? 100 / (trends.length - 1) : 50

  function yPos(value: number): number {
    return paddingTop + innerHeight - (value / yMax) * innerHeight
  }

  const clickRates = trends.map((t) => t.click_rate)

  // Grid lines
  const gridStep = yMax <= 20 ? 5 : yMax <= 50 ? 10 : 20
  const gridLines: number[] = []
  for (let v = gridStep; v <= yMax; v += gridStep) gridLines.push(v)

  const svgWidth = Math.max(trends.length * 60, 400)

  return (
    <div className="glass-card rounded-2xl p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          Engagement pro Newsletter
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            Klickrate
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${chartHeight}`}
          width={svgWidth}
          height={chartHeight}
          className="w-full"
          style={{ minWidth: svgWidth }}
        >
          {/* Grid lines */}
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={0}
                y1={yPos(v)}
                x2={svgWidth}
                y2={yPos(v)}
                stroke="currentColor"
                className="text-[var(--text-secondary)]"
                strokeDasharray="4 4"
                opacity={0.15}
              />
              <text
                x={0}
                y={yPos(v) - 4}
                className="text-[var(--text-secondary)]"
                fill="currentColor"
                fontSize={10}
                opacity={0.5}
              >
                {v}%
              </text>
            </g>
          ))}

          {/* Click rate line */}
          <polyline
            points={clickRates.map((v, i) => `${i * pointSpacing},${yPos(v)}`).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Interactive points + labels */}
          {trends.map((t, i) => {
            const x = i * pointSpacing
            const dateLabel = new Date(t.sent_at).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' })
            const isHovered = hoveredIdx === i

            return (
              <g key={t.id}>
                {/* Hover area */}
                <rect
                  x={x - pointSpacing / 2}
                  y={0}
                  width={pointSpacing}
                  height={chartHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />

                {/* Vertical guide on hover */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={chartHeight - paddingBottom}
                    stroke="currentColor"
                    className="text-[var(--text-secondary)]"
                    strokeDasharray="2 2"
                    opacity={0.3}
                  />
                )}

                {/* Points */}
                <circle cx={x} cy={yPos(t.click_rate)} r={isHovered ? 5 : 3} fill="#3b82f6" />

                {/* X-axis label */}
                <text
                  x={x}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[var(--text-secondary)]"
                  fontSize={10}
                  opacity={0.6}
                >
                  {dateLabel}
                </text>

                {/* Tooltip */}
                {isHovered && (
                  <g>
                    <rect
                      x={x - 80}
                      y={paddingTop - 14}
                      width={160}
                      height={40}
                      rx={8}
                      fill="var(--bg)"
                      stroke="var(--border)"
                      strokeWidth={1}
                      opacity={0.95}
                    />
                    <text x={x} y={paddingTop + 2} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text)">
                      {t.subject.length > 28 ? t.subject.slice(0, 28) + '…' : t.subject}
                    </text>
                    <text x={x} y={paddingTop + 16} textAnchor="middle" fontSize={10} fill="#3b82f6">
                      Klickrate: {t.click_rate}% · {t.recipient_count} Empfänger
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function SubscriberGrowthChart({ data }: { data: SubscriberGrowth[] }) {
  if (data.length < 2) return null

  const max = Math.max(...data.map((d) => d.total), 1)
  const steps = [5, 10, 25, 50, 100, 250, 500, 1000]
  const step = steps.find((s) => max / s <= 5) || 2500
  const gridLines: number[] = []
  for (let v = step; v <= max; v += step) gridLines.push(v)

  const chartHeight = 140

  return (
    <div className="glass-card rounded-2xl p-6 shadow-lg">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
        Abonnenten-Wachstum
      </h3>
      <div style={{ position: 'relative', height: chartHeight, paddingLeft: 36, marginTop: 20 }}>
        {/* Grid lines */}
        {gridLines.map((v) => (
          <div
            key={v}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${(v / max) * ((chartHeight - 20) / chartHeight) * 100}%`,
            }}
          >
            <span
              className="text-[var(--text-secondary)]"
              style={{ position: 'absolute', left: 0, top: -6, fontSize: 10, opacity: 0.5, lineHeight: 1 }}
            >
              {v}
            </span>
            <div
              style={{ marginLeft: 36, borderTop: '1px dashed', opacity: 0.2 }}
              className="text-[var(--text-secondary)]"
            />
          </div>
        ))}
        {/* Bars */}
        <div className="flex items-end gap-2 sm:gap-3" style={{ position: 'relative', zIndex: 1, height: '100%' }}>
          {data.map(({ month, total, new_count }) => {
            const [year, m] = month.split('-')
            const label = `${MONTH_LABELS[m] || m} ${year.slice(2)}`
            const barHeight = Math.max(Math.round((total / max) * (chartHeight - 20)), 4)

            return (
              <div
                key={month}
                className="group flex flex-col items-center gap-1"
                style={{ flex: '1 1 0', minWidth: 32, maxWidth: 64, alignSelf: 'flex-end' }}
                title={`${label}: ${total} total (+${new_count} neu)`}
              >
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  {total}
                </span>
                <div className="relative w-full">
                  <div
                    className="w-full rounded-t bg-primary-500/80 dark:bg-primary-400/80"
                    style={{ height: barHeight }}
                  />
                  {new_count > 0 && (
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-primary-600 dark:bg-primary-300"
                      style={{ height: Math.max(Math.round((new_count / max) * (chartHeight - 20)), 2) }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Main Component ----------------------------------------------------

export default function AdminNewsletter() {
  const [phase, setPhase] = useState<'checking' | 'login' | 'loaded'>('checking')
  const [tab, setTab] = useState<Tab>('compose')
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [sends, setSends] = useState<NewsletterSend[]>([])
  const [posts, setPosts] = useState<Post[]>([])

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
  const [selectedSend, setSelectedSend] = useState<NewsletterSend | null>(null)
  const [sendRecipients, setSendRecipients] = useState<NewsletterRecipientRow[]>([])
  const [sendLinkClicks, setSendLinkClicks] = useState<LinkClickRow[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryConfirm, setRetryConfirm] = useState(false)

  // Settings state
  const [generatorPrompt, setGeneratorPrompt] = useState('')
  const [reviewerPrompt, setReviewerPrompt] = useState('')
  const [promptsLoaded, setPromptsLoaded] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)

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

  async function loadSendDetail(send: NewsletterSend) {
    setSelectedSend(send)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/newsletter?sendDetail=${send.id}`)
      const json = await res.json()
      setSendRecipients(json.sendDetail?.recipients ?? [])
      setSendLinkClicks(json.sendDetail?.linkClicks ?? [])
    } catch (err) {
      console.error('Failed to load send detail:', err)
    }
    setLoadingDetail(false)
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

  async function handleRetryFailed(send: NewsletterSend) {
    const failedCount = sendRecipients.filter((r) => !r.resend_email_id).length
    if (failedCount === 0) {
      setToast({ type: 'info', message: 'Keine fehlgeschlagenen Empfänger.' })
      return
    }

    if (!retryConfirm) {
      setRetryConfirm(true)
      return
    }
    setRetryConfirm(false)
    setRetrying(true)
    try {
      const result = await streamingSend(
        { action: 'retry-failed', sendId: send.id },
        ({ sent, total }) => setToast({ type: 'info', message: `${sent} von ${total} nachgesendet…` })
      )
      if (result.sent > 0) {
        setToast({ type: 'success', message: `${result.sent} erfolgreich nachgesendet.` })
      }
      await loadSendDetail(send)
      await loadData()
    } catch (err: any) {
      setToast({ type: 'error', message: err.message })
    }
    setRetrying(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (tab === 'history' && sendTrends.length === 0) {
      loadTrends()
    }
  }, [tab])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(timer)
  }, [toast])

  async function loadPrompts() {
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings?key=subject_prompt_generator'),
        fetch('/api/admin/settings?key=subject_prompt_reviewer'),
      ])
      if (genRes.ok) {
        const data = await genRes.json()
        setGeneratorPrompt(data.value || '')
      }
      if (revRes.ok) {
        const data = await revRes.json()
        setReviewerPrompt(data.value || '')
      }
    } catch { /* ignore */ }
    setPromptsLoaded(true)
  }

  async function savePrompts() {
    setSavingPrompt(true)
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_generator', value: generatorPrompt }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_reviewer', value: reviewerPrompt }),
        }),
      ])
      if (genRes.ok && revRes.ok) {
        setToast({ type: 'success', message: 'Prompts gespeichert.' })
      } else {
        setToast({ type: 'error', message: 'Fehler beim Speichern der Prompts.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
    }
    setSavingPrompt(false)
  }

  async function resetPrompts() {
    setGeneratorPrompt('')
    setReviewerPrompt('')
    setSavingPrompt(true)
    try {
      const [genRes, revRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_generator', value: '' }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'subject_prompt_reviewer', value: '' }),
        }),
      ])
      if (genRes.ok && revRes.ok) {
        setToast({ type: 'success', message: 'Prompts zurückgesetzt.' })
      } else {
        setToast({ type: 'error', message: 'Fehler beim Zurücksetzen.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
    }
    setSavingPrompt(false)
  }

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
      // Build posts map from blocks
      const postsMap: Record<string, { title: string; summary: string }> = {}
      for (const block of blocks) {
        const addPost = (slug: string) => {
          const post = posts.find((p) => p.slug === slug)
          if (post) postsMap[slug] = { title: post.title, summary: post.summary }
        }
        if (block.type === 'hero' && block.slug) addPost(block.slug)
        if (block.type === 'link-list') block.slugs.forEach((s) => { if (s) addPost(s) })
      }
      const res = await fetch('/api/admin/suggest-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, posts: postsMap }),
      })
      if (!res.ok) throw new Error('Fehler beim Generieren')
      const data = await res.json()
      if (data.subject) setSubject(data.subject)
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

  function insertBlock(type: NewsletterBlock['type'], at: number) {
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
    } catch (err: any) {
      setToast({ type: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  function handleDeleteSubscriber(id: number) {
    setConfirmAction({
      title: 'Abonnent löschen',
      message: 'Abonnent wirklich löschen?',
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          const res = await fetch('/api/admin/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', subscriberId: id }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setToast({ type: 'error', message: data.error || 'Löschen fehlgeschlagen.' })
            return
          }
          setToast({ type: 'success', message: 'Abonnent gelöscht.' })
          loadData()
        } catch {
          setToast({ type: 'error', message: 'Verbindung fehlgeschlagen.' })
        }
      },
    })
  }

  if (phase === 'checking') {
    return <div className="py-12 text-center text-[var(--text-secondary)]">Laden…</div>
  }

  if (phase === 'login') {
    return <LoginForm onLogin={loadData} />
  }

  const tabCls = (t: Tab) =>
    `rounded-full px-5 py-2 text-sm font-medium transition-colors ${
      tab === t
        ? 'bg-primary-700text-white'
        : 'border border-slate-300 text-[var(--text-secondary)] hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
    }`

  const postsMap = buildPostsMap(blocks, posts)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="text-3xl font-bold text-primary-500">{confirmedCount}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Bestätigt</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="text-3xl font-bold text-amber-500">
            {subscribers.filter((s) => s.status === 'pending').length}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Ausstehend</div>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="text-3xl font-bold text-slate-400">{sends.length}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">Versendet</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('compose')} className={tabCls('compose')}>
          Newsletter erstellen
        </button>
        <button onClick={() => setTab('subscribers')} className={tabCls('subscribers')}>
          Abonnenten ({subscribers.length})
        </button>
        <button onClick={() => setTab('history')} className={tabCls('history')}>
          Versand-Historie
        </button>
        <button onClick={() => { setTab('settings'); if (!promptsLoaded) loadPrompts() }} className={tabCls('settings')}>
          Einstellungen
        </button>
        <button onClick={() => setTab('automations')} className={tabCls('automations')}>
          Automatisierung
        </button>
      </div>

      {/* --- Compose Tab ------------------------------------------- */}
      {tab === 'compose' && (
        <div className="glass-card space-y-5 rounded-2xl p-6">
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
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Eigene Templates</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
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
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Gespeicherte Entwürfe</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="space-y-2">
                    {drafts.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/60 px-4 py-3 transition-colors hover:border-primary-300 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-primary-600"
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-600 dark:border-slate-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
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
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
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
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
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
                  <div className="rounded-xl border border-slate-200 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <h4 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">
                      Artikel (Drag &amp; Drop)
                    </h4>
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
                  className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Entwurf speichern
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!blocksAreValid(blocks)}
                  className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
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
                  className="flex-1 rounded-full bg-primary-700px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-800 hover:shadow-md disabled:opacity-50"
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
      {tab === 'subscribers' && (
        <div className="glass-card overflow-hidden rounded-2xl">
          {subscribers.length === 0 ? (
            <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
              Noch keine Abonnenten.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">E-Mail</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Datum</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => {
                  const badge = statusBadge[s.status] || statusBadge.pending
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="px-5 py-3 text-[var(--text)]">{s.email}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDeleteSubscriber(s.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* --- History / Reporting Tab ------------------------------- */}
      {tab === 'history' && (
        <div className="space-y-6">
          {/* KPI Dashboard */}
          {overallStats && overallStats.total_sends > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="glass-card rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {overallStats.avg_open_rate}%
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Öffnungsrate</div>
              </div>
              <div className="glass-card rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {overallStats.avg_click_rate}%
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Klickrate</div>
              </div>
              <div className="glass-card rounded-2xl p-5 text-center">
                <div className={`text-2xl font-bold ${overallStats.avg_bounce_rate > 2 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                  {overallStats.avg_bounce_rate}%
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Bounce-Rate</div>
              </div>
              <div className="glass-card rounded-2xl p-5 text-center">
                <div className={`text-2xl font-bold ${overallStats.total_complaints > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                  {overallStats.total_complaints}
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Beschwerden</div>
              </div>
            </div>
          )}

          {/* Trend Charts */}
          {!selectedSend && (
            <div className="grid gap-6 lg:grid-cols-2">
              {sendTrends.length >= 2 && <div className="lg:col-span-2"><EngagementTrendChart trends={sendTrends} /></div>}
              {subscriberGrowth.length >= 2 && <div className="lg:col-span-2"><SubscriberGrowthChart data={subscriberGrowth} /></div>}
            </div>
          )}

          {/* Detail View */}
          {selectedSend ? (
            <div className="space-y-6">
              <button
                onClick={() => { setSelectedSend(null); setSendRecipients([]); setSendLinkClicks([]) }}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
              >
                <span>←</span> Zurück zur Übersicht
              </button>

              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">{selectedSend.subject}</h3>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {formatDate(selectedSend.sent_at)} · {selectedSend.recipient_count} Empfänger
                    </div>
                  </div>
                  {!loadingDetail && sendRecipients.filter((r) => !r.resend_email_id).length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      {retryConfirm && !retrying && (
                        <button
                          onClick={() => setRetryConfirm(false)}
                          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          Abbrechen
                        </button>
                      )}
                      <button
                        onClick={() => handleRetryFailed(selectedSend)}
                        disabled={retrying}
                        className={`rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${retryConfirm ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                      >
                        {retrying
                          ? 'Wird gesendet…'
                          : retryConfirm
                            ? `Jetzt ${sendRecipients.filter((r) => !r.resend_email_id).length} Emails senden?`
                            : `${sendRecipients.filter((r) => !r.resend_email_id).length} fehlgeschlagene nochmal senden`}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {loadingDetail ? (
                <div className="glass-card rounded-2xl p-6 text-center text-[var(--text-secondary)]">Laden…</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="glass-card rounded-2xl p-4 text-center">
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{selectedSend.delivered_count ?? 0}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Zugestellt</div>
                    </div>
                    <div className="glass-card rounded-2xl p-4 text-center">
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{selectedSend.opened_count ?? 0}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Geöffnet</div>
                    </div>
                    <div className="glass-card rounded-2xl p-4 text-center">
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">{selectedSend.clicked_count ?? 0}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Geklickt</div>
                    </div>
                    <div className="glass-card rounded-2xl p-4 text-center">
                      <div className={`text-xl font-bold ${(selectedSend.bounced_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                        {selectedSend.bounced_count ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Bounced</div>
                    </div>
                  </div>

                  {/* Link Performance */}
                  {sendLinkClicks.length > 0 && (
                    <div className="glass-card overflow-hidden rounded-2xl">
                      <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
                        <h4 className="font-medium text-[var(--text)]">Link-Performance</h4>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">URL</th>
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th>
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Eindeutig</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sendLinkClicks.map((lc, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                              <td className="px-5 py-3 text-[var(--text)]">
                                <span className="block max-w-xs truncate" title={lc.url}>
                                  {lc.url.length > 60 ? lc.url.substring(0, 57) + '…' : lc.url}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right text-[var(--text)]">{lc.click_count}</td>
                              <td className="px-5 py-3 text-right text-[var(--text)]">{lc.unique_clickers}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Recipients Table */}
                  {sendRecipients.length > 0 && (
                    <div className="glass-card overflow-hidden rounded-2xl">
                      <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
                        <h4 className="font-medium text-[var(--text)]">Empfänger ({sendRecipients.length})</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">E-Mail</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geöffnet</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounce</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sendRecipients.map((r) => {
                              const recipientBadge: Record<string, { label: string; cls: string }> = {
                                sent: { label: 'Gesendet', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
                                delivered: { label: 'Zugestellt', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
                                opened: { label: 'Geöffnet', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
                                clicked: { label: 'Geklickt', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
                                bounced: { label: 'Bounced', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
                                complained: { label: 'Beschwerde', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
                              }
                              const badge = recipientBadge[r.status] || recipientBadge.sent
                              return (
                                <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                  <td className="px-5 py-3 text-[var(--text)]">{r.email}</td>
                                  <td className="px-5 py-3">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                                    {r.delivered_at ? formatDate(r.delivered_at) : '—'}
                                  </td>
                                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                                    {r.opened_at ? `${formatDate(r.opened_at)}${r.open_count > 1 ? ` (${r.open_count}×)` : ''}` : '—'}
                                  </td>
                                  <td className="px-5 py-3 text-right text-[var(--text)]">
                                    {r.click_count > 0 ? r.click_count : '—'}
                                  </td>
                                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                                    {r.bounce_type || '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Send List */
            <div className="glass-card overflow-hidden rounded-2xl">
              {sends.length === 0 ? (
                <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                  Noch keine Newsletter versendet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Betreff</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Empfänger</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geöffnet</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geklickt</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounced</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sends.map((s) => {
                        const hasTracking = (s.delivered_count ?? 0) > 0 || (s.opened_count ?? 0) > 0 || (s.bounced_count ?? 0) > 0
                        const openRate = hasTracking && s.recipient_count > 0
                          ? Math.round(((s.opened_count ?? 0) / s.recipient_count) * 100)
                          : null
                        const clickRate = hasTracking && s.recipient_count > 0
                          ? Math.round(((s.clicked_count ?? 0) / s.recipient_count) * 100)
                          : null
                        const openRateColor = openRate === null ? '' : openRate > 40 ? 'text-emerald-600 dark:text-emerald-400' : openRate >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'

                        return (
                          <tr
                            key={s.id}
                            onClick={() => loadSendDetail(s)}
                            className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                          >
                            <td className="px-5 py-3 text-[var(--text)]">
                              <div className="font-medium">{s.subject}</div>
                              <div className="text-xs text-[var(--text-secondary)]">{s.post_title}</div>
                            </td>
                            <td className="px-5 py-3 text-[var(--text)]">{s.recipient_count}</td>
                            <td className="px-5 py-3 text-[var(--text)]">
                              {hasTracking ? (s.delivered_count ?? 0) : '—'}
                            </td>
                            <td className="px-5 py-3">
                              {hasTracking ? (
                                <span className={openRateColor}>
                                  {s.opened_count ?? 0} ({openRate}%)
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 text-[var(--text)]">
                              {hasTracking ? (
                                <span>
                                  {s.clicked_count ?? 0}{clickRate !== null ? ` (${clickRate}%)` : ''}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 text-[var(--text)]">
                              {hasTracking ? (s.bounced_count ?? 0) : '—'}
                            </td>
                            <td className="px-5 py-3 text-[var(--text-secondary)]">
                              {formatDate(s.sent_at)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Settings Tab -------------------------------------------- */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {!promptsLoaded ? (
            <div className="glass-card rounded-2xl p-6">
              <div className="py-6 text-center text-[var(--text-secondary)]">Laden…</div>
            </div>
          ) : (
            <>
              {/* Generator Prompt */}
              <div className="glass-card space-y-4 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">Schritt 1: Generator-Prompt</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Generiert 10 Betreffzeilen-Vorschläge und markiert die besten 3.
                  Leer lassen für den Standard-Prompt.
                </p>
                <textarea
                  value={generatorPrompt}
                  onChange={(e) => setGeneratorPrompt(e.target.value)}
                  placeholder={`Du bist ein Newsletter-Betreff-Generator für "KOKOMO" — einen Tiny House Blog aus der Schweiz.\nDie Bewohner sind Sibylle und Michi, die seit September 2022 in ihrem Tiny House leben.\n\nDeine Aufgabe: Generiere genau 10 Newsletter-Betreffzeilen basierend auf den Inhalten.\nMarkiere die besten 3 als Top-Vorschläge.\n\nRegeln:\n- Maximal 60 Zeichen pro Betreffzeile\n- Persoenlich und authentisch, kein Clickbait\n- Macht neugierig und animiert zum Oeffnen\n- Verwende "ss" statt "ß"\n- Deutsch (Schweizer Stil)`}
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-[var(--text)] placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800/80 dark:placeholder:text-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-800"
                />
                <p className="text-xs text-[var(--text-secondary)] opacity-75">
                  <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">{'{{content}}'}</code> wird durch den Newsletter-Inhalt ersetzt (optional — der Inhalt wird auch als separate Nachricht gesendet).
                  Das JSON-Antwortformat wird automatisch angehängt.
                </p>
              </div>

              {/* Reviewer Prompt */}
              <div className="glass-card space-y-4 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">Schritt 2: Reviewer-Prompt</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Wählt die beste Betreffzeile aus oder formuliert eine bessere.
                  Leer lassen für den Standard-Prompt.
                </p>
                <textarea
                  value={reviewerPrompt}
                  onChange={(e) => setReviewerPrompt(e.target.value)}
                  placeholder={`Du bist ein erfahrener Newsletter-Redakteur für "KOKOMO" — einen Tiny House Blog aus der Schweiz.\n\nDu erhältst 10 Betreffzeilen-Vorschläge, davon 3 als Top-Vorschläge markiert.\nWähle die beste Betreffzeile aus oder formuliere eine noch bessere basierend auf den Vorschlägen.\n\nKriterien:\n- Maximal 60 Zeichen\n- Hohe Oeffnungsrate\n- Authentisch, nicht reisserisch\n- Verwende "ss" statt "ß"`}
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-[var(--text)] placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800/80 dark:placeholder:text-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-800"
                />
                <p className="text-xs text-[var(--text-secondary)] opacity-75">
                  Erhält die Generator-Vorschläge als Eingabe.
                  Das JSON-Antwortformat wird automatisch angehängt.
                </p>
              </div>

              {/* Save / Reset Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={savePrompts}
                  disabled={savingPrompt}
                  className="rounded-full bg-primary-700px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
                >
                  {savingPrompt ? 'Speichern…' : 'Beide Prompts speichern'}
                </button>
                <button
                  onClick={resetPrompts}
                  disabled={savingPrompt}
                  className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Zurücksetzen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Automations Tab --------------------------------------- */}
      {tab === 'automations' && (
        <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} />
      )}

      {/* --- Toast ----------------------------------------------- */}
      {toast && (
        <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none">
          <div
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-xl backdrop-blur-md ${
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
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/90">
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
                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSendConfirmed}
                className="rounded-full bg-primary-700px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800"
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
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/90">
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
                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
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
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/90">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">{confirmAction.title}</h3>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">{confirmAction.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="rounded-full bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
