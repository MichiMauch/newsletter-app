'use client'

import React, { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import TiptapEditor from './TiptapEditor'
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
  site_url: 'https://preview.localhost',
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
    cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  },
}

const blockTypeLabels: Record<NewsletterBlock['type'], string> = {
  hero: 'Hero',
  text: 'Freitext',
  'link-list': 'Link-Liste',
  last_newsletter: 'Letzter Newsletter',
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
    case 'last_newsletter':
      return { id, type: 'last_newsletter' }
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
    <div style={{ width: 380 }}>
      <div style={{ borderBottom: '3px solid var(--color-primary)', marginBottom: 40, paddingBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
          Newsletter
        </div>
        <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>
          Admin
        </h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{ width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{ width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <button type="submit" disabled={loading} className="glow-button" style={{ width: '100%' }}>
          {loading ? 'Wird angemeldet…' : 'Anmelden →'}
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 20, padding: '12px 16px', borderLeft: '3px solid #ef4444', background: 'var(--bg-secondary)', fontSize: 13, color: '#ef4444' }}>
          {error}
        </div>
      )}
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
  onInsert: (type: NewsletterBlock['type']) => void
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
        <TiptapEditor
          content={block.content}
          onChange={(html) => onUpdate({ ...block, content: html })}
          placeholder="Freitext eingeben…"
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

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mär', '04': 'Apr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Dez',
}

// --- Click Heatmap -------------------------------------------------------

function ClickHeatmap({
  html,
  linkClicks,
  recipientCount,
}: {
  html: string
  linkClicks: LinkClickRow[]
  recipientCount: number
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [iframeHeight, setIframeHeight] = useState(600)

  const maxClicks = Math.max(...linkClicks.map((lc) => lc.click_count), 1)

  // Build a map from URL -> click data
  const clickMap = new Map<string, LinkClickRow>()
  for (const lc of linkClicks) {
    clickMap.set(lc.url, lc)
  }

  const injectHeatmap = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return

    // Set iframe height to content
    const body = doc.body
    if (body) {
      setIframeHeight(body.scrollHeight + 20)
    }

    // Find all links and overlay heatmap
    const links = doc.querySelectorAll('a[href]')
    links.forEach((link) => {
      const a = link as HTMLAnchorElement
      const href = a.href
      const lc = clickMap.get(href)
      if (!lc) return

      // Make the link's parent position:relative if not already
      const parent = a.parentElement
      if (parent) {
        const pos = doc.defaultView?.getComputedStyle(parent).position
        if (pos === 'static') parent.style.position = 'relative'
      }

      // Intensity: 0..1
      const intensity = lc.click_count / maxClicks
      const clickPct = recipientCount > 0 ? Math.round((lc.unique_clickers / recipientCount) * 100) : 0

      // Color: from cool (low) to hot (high)
      const hue = Math.round((1 - intensity) * 60) // 60=yellow, 0=red
      const bgColor = `hsla(${hue}, 100%, 50%, ${0.15 + intensity * 0.35})`
      const borderColor = `hsla(${hue}, 100%, 45%, ${0.4 + intensity * 0.4})`

      // Apply heatmap overlay to the link itself
      a.style.position = 'relative'
      a.style.backgroundColor = bgColor
      a.style.outline = `2px solid ${borderColor}`
      a.style.outlineOffset = '2px'

      // Add badge
      const badge = doc.createElement('span')
      badge.textContent = `${lc.click_count} Klicks · ${clickPct}%`
      badge.style.cssText = `
        position: absolute; top: -10px; right: -4px; z-index: 10;
        background: hsl(${hue}, 90%, 42%); color: #fff;
        font-size: 10px; font-weight: 700; font-family: system-ui, sans-serif;
        padding: 2px 7px; border-radius: 6px; white-space: nowrap;
        line-height: 1.4; pointer-events: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      `
      a.appendChild(badge)
    })
  }, [clickMap, maxClicks, recipientCount])

  const handleLoad = useCallback(() => {
    // Small delay to let the iframe render
    setTimeout(injectHeatmap, 100)
  }, [injectHeatmap])

  // Render the newsletter HTML into the iframe via srcdoc
  const iframeSrc = `
    <!DOCTYPE html>
    <html><head>
      <meta charset="utf-8" />
      <style>
        body { margin: 0; padding: 16px; background: #f3f4f6; display: flex; justify-content: center; }
        a { pointer-events: none; }
      </style>
    </head><body>${html}</body></html>
  `

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <h4 className="font-medium text-[var(--text)]">Klick-Heatmap</h4>
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(60,100%,50%,0.4)', border: '1px solid hsla(60,100%,45%,0.6)' }} /> Wenig</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(30,100%,50%,0.4)', border: '1px solid hsla(30,100%,45%,0.6)' }} /> Mittel</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(0,100%,50%,0.5)', border: '1px solid hsla(0,100%,45%,0.8)' }} /> Viel</span>
        </div>
      </div>
      <div ref={containerRef} className="relative bg-[#f3f4f6] dark:bg-[#1a1a1a]">
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrc}
          onLoad={handleLoad}
          style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }}
          sandbox="allow-same-origin"
          title="Newsletter Klick-Heatmap"
        />
      </div>
    </div>
  )
}

function ClickHeatmapList({
  linkClicks,
  recipientCount,
}: {
  linkClicks: LinkClickRow[]
  recipientCount: number
}) {
  const maxClicks = Math.max(...linkClicks.map((lc) => lc.click_count), 1)

  return (
    <div className="glass-card overflow-hidden rounded-xl">
      <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <h4 className="font-medium text-[var(--text)]">Klick-Heatmap</h4>
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(60,100%,50%,0.4)', border: '1px solid hsla(60,100%,45%,0.6)' }} /> Wenig</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(30,100%,50%,0.4)', border: '1px solid hsla(30,100%,45%,0.6)' }} /> Mittel</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: 'hsla(0,100%,50%,0.5)', border: '1px solid hsla(0,100%,45%,0.8)' }} /> Viel</span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {linkClicks.map((lc, i) => {
          const intensity = lc.click_count / maxClicks
          const hue = Math.round((1 - intensity) * 60)
          const pct = recipientCount > 0 ? Math.round((lc.unique_clickers / recipientCount) * 100) : 0
          const barWidth = Math.max(Math.round(intensity * 100), 4)

          // Extract a readable label from the URL
          let label = lc.url
          try {
            const u = new URL(lc.url)
            label = u.pathname === '/' ? u.hostname : u.pathname.replace(/\/$/, '').split('/').pop() || u.pathname
          } catch { /* keep full url */ }

          return (
            <div key={i} className="relative">
              {/* Background bar */}
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${barWidth}%`,
                  background: `hsla(${hue}, 100%, 50%, ${0.1 + intensity * 0.15})`,
                  borderRight: `3px solid hsla(${hue}, 100%, 45%, ${0.5 + intensity * 0.4})`,
                }}
              />
              <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] truncate" title={lc.url}>
                    {label}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate" title={lc.url}>
                    {lc.url.length > 70 ? lc.url.substring(0, 67) + '…' : lc.url}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs font-bold text-white px-2 py-0.5"
                    style={{ background: `hsl(${hue}, 90%, 42%)` }}
                  >
                    {lc.click_count} Klicks
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">{pct}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EngagementTrendChart({ trends }: { trends: SendTrend[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (trends.length < 2) return null

  const values = trends.map((t) => t.click_rate)
  const dataMax = Math.max(...values, 1)
  const dataMin = Math.min(...values)
  const padding = Math.max(Math.ceil((dataMax - dataMin) * 0.25), 2)
  const yMin = Math.max(dataMin - padding, 0)
  const yMax = Math.min(dataMax + padding, 100)
  const yRange = yMax - yMin || 1

  const avgClick = trends.reduce((s, t) => s + t.click_rate, 0) / trends.length
  const avgBounce = trends.reduce((s, t) => s + t.bounce_rate, 0) / trends.length
  const latestClick = trends[trends.length - 1].click_rate

  // SVG dimensions
  const W = 600
  const H = 200
  const PL = 40
  const PR = 16
  const PT = 12
  const PB = 28
  const cw = W - PL - PR
  const ch = H - PT - PB

  const toX = (i: number) => PL + (i / (trends.length - 1)) * cw
  const toY = (v: number) => PT + ch - ((v - yMin) / yRange) * ch

  // Paths
  const linePath = trends.map((t, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(t.click_rate).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(trends.length - 1).toFixed(1)},${toY(yMin).toFixed(1)} L${toX(0).toFixed(1)},${toY(yMin).toFixed(1)} Z`

  // Grid
  const steps = [1, 2, 5, 10, 20, 25, 50]
  const step = steps.find((s) => yRange / s <= 5) || 50
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    if (v > yMin) gridLines.push(v)
  }

  const hoverData = hoverIdx !== null ? trends[hoverIdx] : null
  const hoverDate = hoverData ? new Date(hoverData.sent_at).toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <div className="glass-card rounded-xl p-6 shadow-lg">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Engagement
          </h3>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-[var(--text)]">{latestClick.toFixed(1)}%</span>
            <span className="text-sm text-[var(--text-secondary)]">letzte Klickrate</span>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
          <div className="text-center">
            <div className="text-lg font-semibold text-primary-600 dark:text-primary-400">{avgClick.toFixed(1)}%</div>
            <div>Ø Klickrate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-500">{avgBounce.toFixed(1)}%</div>
            <div>Ø Bounce</div>
          </div>
        </div>
      </div>

      {/* Area Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto', maxHeight: 240 }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="engagementGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)}
                stroke="var(--color-text-secondary, #888)" strokeWidth="0.5" opacity="0.15"
                strokeDasharray="4 3"
              />
              <text
                x={PL - 6} y={toY(v) + 3}
                textAnchor="end" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6"
              >
                {v}%
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {trends.map((t, i) => {
            const showLabel = trends.length <= 12 || i % Math.ceil(trends.length / 10) === 0 || i === trends.length - 1
            if (!showLabel) return null
            const d = new Date(t.sent_at)
            const label = d.toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' })
            return (
              <text
                key={t.id}
                x={toX(i)} y={H - 6}
                textAnchor="middle" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6"
              >
                {label}
              </text>
            )
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#engagementGrad)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary-500)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {trends.map((t, i) => (
            <circle
              key={t.id}
              cx={toX(i)} cy={toY(t.click_rate)}
              r={hoverIdx === i ? 5 : 3}
              fill="var(--color-primary-500)"
              stroke="var(--color-bg, #fff)" strokeWidth="2"
              className="transition-all duration-150"
            />
          ))}

          {/* Hover zones */}
          {trends.map((_, i) => {
            const x0 = i === 0 ? PL : (toX(i - 1) + toX(i)) / 2
            const x1 = i === trends.length - 1 ? W - PR : (toX(i) + toX(i + 1)) / 2
            return (
              <rect
                key={i}
                x={x0} y={PT} width={x1 - x0} height={ch}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: 'crosshair' }}
              />
            )
          })}

          {/* Hover vertical line */}
          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)} y1={PT} x2={toX(hoverIdx)} y2={PT + ch}
              stroke="var(--color-primary-500)" strokeWidth="1" opacity="0.3"
              strokeDasharray="3 2"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hoverData && hoverIdx !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 shadow-lg"
            style={{
              left: `${(toX(hoverIdx) / W) * 100}%`,
              top: 0,
              transform: `translateX(${hoverIdx > trends.length / 2 ? '-100%' : '0'})`,
            }}
          >
            <div className="text-xs font-medium text-[var(--text)] truncate" style={{ maxWidth: 200 }}>
              {hoverData.subject}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{hoverDate} · {hoverData.recipient_count} Empfänger</div>
            <div className="mt-1 text-xs">
              <span className="text-primary-600 dark:text-primary-400 font-semibold">{hoverData.click_rate}% Klickrate</span>
            </div>
            {hoverData.bounce_rate > 0 && (
              <div className="text-xs text-red-500">{hoverData.bounce_rate}% Bounce</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type GrowthRange = '6m' | '12m' | 'all'

function SubscriberGrowthChart({ data }: { data: SubscriberGrowth[] }) {
  const [range, setRange] = useState<GrowthRange>('12m')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) return null

  const filtered = range === 'all' ? data : data.slice(-(range === '6m' ? 6 : 12))
  const totals = filtered.map((d) => d.total)
  const dataMax = Math.max(...totals)
  const dataMin = Math.min(...totals)
  const padding = Math.max(Math.ceil((dataMax - dataMin) * 0.2), 2)
  const yMin = Math.max(dataMin - padding, 0)
  const yMax = dataMax + padding
  const yRange = yMax - yMin || 1

  const netChange = filtered[filtered.length - 1].total - filtered[0].total
  const totalNew = filtered.reduce((sum, d) => sum + d.new_count, 0)
  const totalUnsub = totalNew - netChange
  const current = filtered[filtered.length - 1].total

  // SVG dimensions
  const W = 600
  const H = 200
  const PL = 40 // padding left
  const PR = 16
  const PT = 12
  const PB = 28
  const cw = W - PL - PR
  const ch = H - PT - PB

  const toX = (i: number) => PL + (i / (filtered.length - 1)) * cw
  const toY = (v: number) => PT + ch - ((v - yMin) / yRange) * ch

  // Build line path
  const linePath = filtered.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.total).toFixed(1)}`).join(' ')
  // Build area path (closed to bottom)
  const areaPath = `${linePath} L${toX(filtered.length - 1).toFixed(1)},${toY(yMin).toFixed(1)} L${toX(0).toFixed(1)},${toY(yMin).toFixed(1)} Z`

  // Grid lines
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]
  const step = steps.find((s) => yRange / s <= 5) || 2500
  const gridLines: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    if (v > yMin) gridLines.push(v)
  }

  const rangeButtons: { key: GrowthRange; label: string }[] = [
    { key: '6m', label: '6M' },
    { key: '12m', label: '1J' },
    { key: 'all', label: 'Alle' },
  ]

  const hoverData = hoverIdx !== null ? filtered[hoverIdx] : null
  const hoverLabel = hoverData ? (() => {
    const [y, m] = hoverData.month.split('-')
    return `${MONTH_LABELS[m] || m} ${y}`
  })() : ''

  return (
    <div className="glass-card rounded-xl p-6 shadow-lg">
      {/* Header: KPIs + Range Toggle */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Abonnenten
          </h3>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-[var(--text)]">{current}</span>
            <span className={`text-sm font-semibold ${netChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {netChange >= 0 ? '+' : ''}{netChange}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
            <div className="text-center">
              <div className="text-lg font-semibold text-primary-600 dark:text-primary-400">+{totalNew}</div>
              <div>Neu</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-500">-{totalUnsub}</div>
              <div>Abgemeldet</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-[var(--text)]">{(totalNew / filtered.length).toFixed(1)}</div>
              <div>Ø Neu/Mt.</div>
            </div>
          </div>
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            {rangeButtons.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === key
                    ? 'bg-primary-500 text-white rounded-lg shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Area Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto', maxHeight: 240 }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)}
                stroke="var(--color-text-secondary, #888)" strokeWidth="0.5" opacity="0.15"
                strokeDasharray="4 3"
              />
              <text
                x={PL - 6} y={toY(v) + 3}
                textAnchor="end" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6"
              >
                {v}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {filtered.map((d, i) => {
            const [y, m] = d.month.split('-')
            const showLabel = filtered.length <= 12 || i % Math.ceil(filtered.length / 12) === 0 || i === filtered.length - 1
            if (!showLabel) return null
            return (
              <text
                key={d.month}
                x={toX(i)} y={H - 6}
                textAnchor="middle" fontSize="10" fill="var(--color-text-secondary, #888)" opacity="0.6"
              >
                {MONTH_LABELS[m] || m} {y.slice(2)}
              </text>
            )
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGrad)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary-500)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {filtered.map((d, i) => (
            <circle
              key={d.month}
              cx={toX(i)} cy={toY(d.total)}
              r={hoverIdx === i ? 5 : 3}
              fill={hoverIdx === i ? 'var(--color-primary-600)' : 'var(--color-primary-500)'}
              stroke="var(--color-bg, #fff)" strokeWidth="2"
              className="transition-all duration-150"
            />
          ))}

          {/* Hover zones (invisible rects for each data point) */}
          {filtered.map((_, i) => {
            const x0 = i === 0 ? PL : (toX(i - 1) + toX(i)) / 2
            const x1 = i === filtered.length - 1 ? W - PR : (toX(i) + toX(i + 1)) / 2
            return (
              <rect
                key={i}
                x={x0} y={PT} width={x1 - x0} height={ch}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: 'crosshair' }}
              />
            )
          })}

          {/* Hover vertical line */}
          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)} y1={PT} x2={toX(hoverIdx)} y2={PT + ch}
              stroke="var(--color-primary-500)" strokeWidth="1" opacity="0.3"
              strokeDasharray="3 2"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hoverData && hoverIdx !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 shadow-lg"
            style={{
              left: `${(toX(hoverIdx) / W) * 100}%`,
              top: 0,
              transform: `translateX(${hoverIdx > filtered.length / 2 ? '-100%' : '0'})`,
            }}
          >
            <div className="text-xs font-medium text-[var(--text)]">{hoverLabel}</div>
            <div className="mt-1 text-sm font-bold text-[var(--text)]">{hoverData.total} Abonnenten</div>
            {hoverData.new_count > 0 && (
              <div className="text-xs text-primary-600 dark:text-primary-400">+{hoverData.new_count} neu</div>
            )}
            {hoverIdx > 0 && (
              <div className={`text-xs ${hoverData.total >= filtered[hoverIdx - 1].total ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {hoverData.total >= filtered[hoverIdx - 1].total ? '+' : ''}{hoverData.total - filtered[hoverIdx - 1].total} netto
              </div>
            )}
          </div>
        )}
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

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
  const [selectedSend, setSelectedSend] = useState<NewsletterSend | null>(null)
  const [sendRecipients, setSendRecipients] = useState<NewsletterRecipientRow[]>([])
  const [sendLinkClicks, setSendLinkClicks] = useState<LinkClickRow[]>([])
  const [sendBlocksJson, setSendBlocksJson] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryConfirm, setRetryConfirm] = useState(false)

  // Settings state
  const [generatorPrompt, setGeneratorPrompt] = useState('')
  const [reviewerPrompt, setReviewerPrompt] = useState('')
  const [promptsLoaded, setPromptsLoaded] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
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

  async function loadSendDetail(send: NewsletterSend) {
    setSelectedSend(send)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/newsletter?sendDetail=${send.id}`)
      const json = await res.json()
      setSendRecipients(json.sendDetail?.recipients ?? [])
      setSendLinkClicks(json.sendDetail?.linkClicks ?? [])
      setSendBlocksJson(json.sendDetail?.blocksJson ?? null)
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
    const failedCount = sendRecipients.filter((r) => r.status === 'sent').length
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

  const sidebarItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'compose', label: 'Erstellen',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>,
    },
    {
      id: 'subscribers', label: 'Abonnenten',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77M12 15.07a5.98 5.98 0 00-1.654-.76M15 19.128H5.228A2 2 0 013 17.16V17" /></svg>,
    },
    {
      id: 'history', label: 'Historie',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    },
    {
      id: 'settings', label: 'Settings',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      id: 'automations', label: 'Automation',
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
            <button
              key={item.id}
              onClick={() => { setTab(item.id); if (item.id === 'settings' && !promptsLoaded) loadPrompts() }}
              className={`sidebar-icon${tab === item.id ? ' active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              {item.icon}
              <span className="sidebar-label">{item.label}</span>
            </button>
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
          <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} />
        )}

        <div className={`mx-auto max-w-[1100px] space-y-6 p-6 ${automationFullscreen ? 'hidden' : ''}`}>
          {/* Stats — editorial oversized numbers (hidden in automation fullscreen) */}
          {!automationFullscreen && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '2px solid var(--foreground)', paddingBottom: 32, marginBottom: 8 }}>
              <div className="animate-fade-in-up">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--color-primary)' }}>{confirmedCount}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 8 }}>Bestätigt</div>
              </div>
              <div className="animate-fade-in-up" style={{ animationDelay: '60ms' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text)' }}>
                  {subscribers.filter((s) => s.status === 'pending').length}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 8 }}>Ausstehend</div>
              </div>
              <div className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--text)' }}>{sends.length}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 8 }}>Versendet</div>
              </div>
            </div>
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
      {tab === 'subscribers' && (
        <div className="glass-card overflow-hidden rounded-xl">
          {subscribers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <svg className="mx-auto h-10 w-10 text-[var(--text-secondary)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.16V17a6.003 6.003 0 017.654-5.77A5.98 5.98 0 0112 15.07m3 4.058a6.042 6.042 0 00-.786-3.07M12 15.07a5.98 5.98 0 00-1.654-.76M12 15.07V12m0 0a3 3 0 10-5.696-1.34" />
              </svg>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Noch keine Abonnenten.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">E-Mail</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Datum</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s, i) => {
                  const badge = statusBadge[s.status] || statusBadge.pending
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-secondary)] ${
                        i % 2 === 0 ? '' : 'bg-[var(--bg-secondary)]/50'
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-[var(--text)]">{s.email}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {formatDate(s.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDeleteSubscriber(s.id)}
                          className="rounded-md px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="glass-card rounded-xl p-5 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {overallStats.avg_click_rate}%
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Klickrate</div>
              </div>
              <div className="glass-card rounded-xl p-5 text-center">
                <div className={`text-2xl font-bold ${overallStats.avg_bounce_rate > 2 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                  {overallStats.avg_bounce_rate}%
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Ø Bounce-Rate</div>
              </div>
              <div className="glass-card rounded-xl p-5 text-center">
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
                onClick={() => { setSelectedSend(null); setSendRecipients([]); setSendLinkClicks([]); setSendBlocksJson(null) }}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
              >
                <span>←</span> Zurück zur Übersicht
              </button>

              <div className="glass-card rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">{selectedSend.subject}</h3>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {formatDate(selectedSend.sent_at)} · {selectedSend.recipient_count} Empfänger
                    </div>
                  </div>
                  {(() => {
                    const failedRecipients = sendRecipients.filter((r) => r.status === 'sent')
                    return !loadingDetail && failedRecipients.length > 0 && (
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
                              ? `Jetzt ${failedRecipients.length} Emails senden?`
                              : `${failedRecipients.length} fehlgeschlagene nochmal senden`}
                        </button>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {loadingDetail ? (
                <div className="glass-card rounded-xl p-6 text-center text-[var(--text-secondary)]">Laden…</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="glass-card rounded-xl p-4 text-center">
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{selectedSend.delivered_count ?? 0}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Zugestellt</div>
                    </div>
                    <div className="glass-card rounded-xl p-4 text-center">
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">{selectedSend.clicked_count ?? 0}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Geklickt</div>
                    </div>
                    <div className="glass-card rounded-xl p-4 text-center">
                      <div className={`text-xl font-bold ${(selectedSend.bounced_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
                        {selectedSend.bounced_count ?? 0}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Bounced</div>
                    </div>
                  </div>

                  {/* Link Performance */}
                  {sendLinkClicks.length > 0 && (
                    <div className="glass-card overflow-hidden rounded-xl">
                      <div className="border-b border-[var(--border)] px-5 py-3">
                        <h4 className="font-medium text-[var(--text)]">Link-Performance</h4>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">URL</th>
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th>
                            <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Eindeutig</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sendLinkClicks.map((lc, i) => (
                            <tr key={i} className="border-b border-[var(--border)] last:border-0">
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

                  {/* Click Heatmap */}
                  {sendLinkClicks.length > 0 && (() => {
                    let html: string | null = null
                    if (sendBlocksJson) {
                      try {
                        const blocks = JSON.parse(sendBlocksJson) as NewsletterBlock[]
                        const postsMap: Record<string, PostRef> = {}
                        for (const p of posts) postsMap[p.slug] = p
                        html = buildMultiBlockNewsletterHtml(PREVIEW_SITE_CONFIG, blocks, postsMap, '#')
                      } catch { /* fallback to list */ }
                    }
                    return html ? (
                      <ClickHeatmap
                        html={html}
                        linkClicks={sendLinkClicks}
                        recipientCount={selectedSend.recipient_count}
                      />
                    ) : (
                      <ClickHeatmapList
                        linkClicks={sendLinkClicks}
                        recipientCount={selectedSend.recipient_count}
                      />
                    )
                  })()}

                  {/* Recipients Table */}
                  {sendRecipients.length > 0 && (
                    <div className="glass-card overflow-hidden rounded-xl">
                      <div className="border-b border-[var(--border)] px-5 py-3">
                        <h4 className="font-medium text-[var(--text)]">Empfänger ({sendRecipients.length})</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">E-Mail</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)] text-right">Klicks</th>
                              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounce</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sendRecipients.map((r) => {
                              const recipientBadge: Record<string, { label: string; cls: string }> = {
                                sent: { label: 'Gesendet', cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]' },
                                delivered: { label: 'Zugestellt', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
                                clicked: { label: 'Geklickt', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' },
                                bounced: { label: 'Bounced', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
                                complained: { label: 'Beschwerde', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
                              }
                              const badge = recipientBadge[r.status] || recipientBadge.sent
                              return (
                                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                                  <td className="px-5 py-3 text-[var(--text)]">{r.email}</td>
                                  <td className="px-5 py-3">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                                    {r.delivered_at ? formatDate(r.delivered_at) : '—'}
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
            <div className="glass-card overflow-hidden rounded-xl">
              {sends.length === 0 ? (
                <div className="px-6 py-12 text-center text-[var(--text-secondary)]">
                  Noch keine Newsletter versendet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Betreff</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Empfänger</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Zugestellt</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Geklickt</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Bounced</th>
                        <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sends.map((s) => {
                        const hasTracking = (s.delivered_count ?? 0) > 0 || (s.bounced_count ?? 0) > 0
                        const clickRate = hasTracking && s.recipient_count > 0
                          ? Math.round(((s.clicked_count ?? 0) / s.recipient_count) * 100)
                          : null

                        return (
                          <tr
                            key={s.id}
                            onClick={() => loadSendDetail(s)}
                            className="cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-secondary)]"
                          >
                            <td className="px-5 py-3 text-[var(--text)]">
                              <div className="font-medium">{s.subject}</div>
                              <div className="text-xs text-[var(--text-secondary)]">{s.post_title}</div>
                            </td>
                            <td className="px-5 py-3 text-[var(--text)]">{s.recipient_count}</td>
                            <td className="px-5 py-3 text-[var(--text)]">
                              {hasTracking ? (s.delivered_count ?? 0) : '—'}
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
            <div className="glass-card rounded-xl p-6">
              <div className="py-6 text-center text-[var(--text-secondary)]">Laden…</div>
            </div>
          ) : (
            <>
              {/* Generator Prompt */}
              <div className="glass-card space-y-4 rounded-xl p-6">
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
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 "
                />
                <p className="text-xs text-[var(--text-secondary)] opacity-75">
                  <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">{'{{content}}'}</code> wird durch den Newsletter-Inhalt ersetzt (optional — der Inhalt wird auch als separate Nachricht gesendet).
                  Das JSON-Antwortformat wird automatisch angehängt.
                </p>
              </div>

              {/* Reviewer Prompt */}
              <div className="glass-card space-y-4 rounded-xl p-6">
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
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 "
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
                  className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingPrompt ? 'Speichern…' : 'Beide Prompts speichern'}
                </button>
                <button
                  onClick={resetPrompts}
                  disabled={savingPrompt}
                  className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                >
                  Zurücksetzen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Automations Tab (non-fullscreen = list view) --------- */}
      {tab === 'automations' && !automationFullscreen && (
        <AutomationEditor siteConfig={PREVIEW_SITE_CONFIG} posts={posts.map(p => ({ slug: p.slug, title: p.title, summary: p.summary, image: p.image, date: p.date }))} onFullscreen={setAutomationFullscreen} />
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
