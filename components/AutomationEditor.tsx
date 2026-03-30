'use client'

import React, { useState, useEffect } from 'react'
import { buildMultiBlockNewsletterHtml } from '@/lib/newsletter-template'
import type { NewsletterBlock, PostRef } from '@/lib/newsletter-blocks'
import type { SiteConfig } from '@/lib/site-config'

// --- Types -------------------------------------------------------------

interface Post {
  slug: string
  title: string
  summary: string
  image: string | null
  date: string
}

interface Automation {
  id: number
  name: string
  trigger_type: string
  active: number
  step_count?: number
  enrollment_count?: number
}

interface Step {
  id: number
  automation_id: number
  step_order: number
  delay_hours: number
  subject: string
  blocks_json: string
}

interface Enrollment {
  id: number
  subscriber_email: string
  status: string
  enrolled_at: string
  completed_at: string | null
  cancelled_at: string | null
}

interface StepStats {
  step_id: number
  step_order: number
  subject: string
  total_sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
}

// --- Helpers -----------------------------------------------------------

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-white'

const btnPrimary =
  'rounded-full bg-primary-700px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50'

const btnSecondary =
  'rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'

function formatDelay(hours: number): string {
  if (hours === 0) return 'Sofort'
  if (hours < 24) return `Nach ${hours} Stunde${hours !== 1 ? 'n' : ''}`
  const days = Math.round(hours / 24)
  if (days < 7) return `Nach ${days} Tag${days !== 1 ? 'en' : ''}`
  const weeks = Math.round(days / 7)
  return `Nach ${weeks} Woche${weeks !== 1 ? 'n' : ''}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createBlock(type: NewsletterBlock['type']): NewsletterBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'hero': return { id, type: 'hero', slug: '' }
    case 'text': return { id, type: 'text', content: '' }
    case 'link-list': return { id, type: 'link-list', slugs: [] }
  }
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

const triggerLabels: Record<string, string> = {
  subscriber_confirmed: 'Nach Bestätigung',
}

async function api(method: string, params: Record<string, string> | object) {
  if (method === 'GET') {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    const res = await fetch(`/api/admin/automations?${qs}`)
    return res.json()
  }
  const res = await fetch('/api/admin/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

// --- Block Editor (simplified, same pattern as AdminNewsletter) --------

function BlockEditor({
  blocks,
  onChange,
  posts,
}: {
  blocks: NewsletterBlock[]
  onChange: (blocks: NewsletterBlock[]) => void
  posts: Post[]
}) {
  const updateBlock = (index: number, updated: NewsletterBlock) => {
    const next = [...blocks]
    next[index] = updated
    onChange(next)
  }

  const removeBlock = (index: number) => {
    onChange(blocks.filter((_, i) => i !== index))
  }

  const moveBlock = (index: number, dir: -1 | 1) => {
    const next = [...blocks]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-xl border border-slate-200 bg-white/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {block.type === 'hero' ? 'Hero' : block.type === 'text' ? 'Freitext' : 'Link-Liste'}
            </span>
            <div className="flex gap-1">
              <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="rounded p-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30">↑</button>
              <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="rounded p-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30">↓</button>
              <button onClick={() => removeBlock(i)} className="rounded p-1 text-xs text-red-400 hover:text-red-600">✕</button>
            </div>
          </div>

          {block.type === 'hero' && (
            <select
              value={block.slug}
              onChange={(e) => updateBlock(i, { ...block, slug: e.target.value })}
              className={inputCls}
            >
              <option value="">Blogpost wählen…</option>
              {posts.map((p) => (
                <option key={p.slug} value={p.slug}>{p.title}</option>
              ))}
            </select>
          )}

          {block.type === 'text' && (
            <textarea
              value={block.content}
              onChange={(e) => updateBlock(i, { ...block, content: e.target.value })}
              rows={4}
              placeholder="Freitext eingeben…"
              className={inputCls}
            />
          )}

          {block.type === 'link-list' && (
            <div className="space-y-2">
              {block.slugs.map((slug, si) => (
                <div key={si} className="flex gap-2">
                  <select
                    value={slug}
                    onChange={(e) => {
                      const next = [...block.slugs]
                      next[si] = e.target.value
                      updateBlock(i, { ...block, slugs: next })
                    }}
                    className={inputCls + ' flex-1'}
                  >
                    <option value="">Blogpost wählen…</option>
                    {posts.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const next = block.slugs.filter((_, idx) => idx !== si)
                      updateBlock(i, { ...block, slugs: next })
                    }}
                    className="rounded-lg px-2 text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateBlock(i, { ...block, slugs: [...block.slugs, ''] })}
                className="text-sm text-primary-500 hover:text-primary-600"
              >
                + Link hinzufügen
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <button onClick={() => onChange([...blocks, createBlock('hero')])} className={btnSecondary + ' text-xs'}>
          + Hero
        </button>
        <button onClick={() => onChange([...blocks, createBlock('text')])} className={btnSecondary + ' text-xs'}>
          + Freitext
        </button>
        <button onClick={() => onChange([...blocks, createBlock('link-list')])} className={btnSecondary + ' text-xs'}>
          + Link-Liste
        </button>
      </div>
    </div>
  )
}

// --- Step Editor -------------------------------------------------------

function StepEditor({
  step,
  index,
  posts,
  siteConfig,
  onSave,
  onDelete,
  onTest,
}: {
  step: Step
  index: number
  posts: Post[]
  siteConfig: SiteConfig
  onSave: (step: Step) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onTest: (step: Step) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(!step.id)
  const [subject, setSubject] = useState(step.subject)
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(() => {
    try { return JSON.parse(step.blocks_json) } catch { return [] }
  })
  const [delayValue, setDelayValue] = useState(() => {
    if (step.delay_hours === 0) return 0
    if (step.delay_hours % (24 * 7) === 0) return step.delay_hours / (24 * 7)
    if (step.delay_hours % 24 === 0) return step.delay_hours / 24
    return step.delay_hours
  })
  const [delayUnit, setDelayUnit] = useState<'hours' | 'days' | 'weeks'>(() => {
    if (step.delay_hours === 0) return 'hours'
    if (step.delay_hours % (24 * 7) === 0) return 'weeks'
    if (step.delay_hours % 24 === 0) return 'days'
    return 'hours'
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const delayHours = delayUnit === 'weeks' ? delayValue * 24 * 7 : delayUnit === 'days' ? delayValue * 24 : delayValue

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      ...step,
      subject,
      delay_hours: delayHours,
      blocks_json: JSON.stringify(blocks),
    })
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    await onTest({ ...step, subject, blocks_json: JSON.stringify(blocks) })
    setTesting(false)
  }

  const postsMap = buildPostsMap(blocks, posts)
  const previewHtml = showPreview
    ? buildMultiBlockNewsletterHtml(siteConfig, blocks, postsMap, '#')
    : ''

  return (
    <div className="relative">
      {/* Timeline connector */}
      {index > 0 && (
        <div className="absolute left-6 -top-4 h-4 w-0.5 bg-slate-300 dark:bg-slate-600" />
      )}

      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-700">
        {/* Collapsed header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-4 p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--text)]">
              {subject || <span className="italic text-slate-400">Kein Betreff</span>}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {formatDelay(step.delay_hours)} · {blocks.length} Block{blocks.length !== 1 ? 'e' : ''}
            </div>
          </div>
          <svg
            className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded editor */}
        {expanded && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
            {/* Delay */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Verzögerung ab Enrollment</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={delayValue}
                  onChange={(e) => setDelayValue(Number(e.target.value))}
                  className={inputCls + ' w-24'}
                />
                <select
                  value={delayUnit}
                  onChange={(e) => setDelayUnit(e.target.value as 'hours' | 'days' | 'weeks')}
                  className={inputCls + ' w-32'}
                >
                  <option value="hours">Stunden</option>
                  <option value="days">Tage</option>
                  <option value="weeks">Wochen</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Betreffzeile</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Betreff eingeben…"
                className={inputCls}
              />
            </div>

            {/* Blocks */}
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">Inhalt</label>
              <BlockEditor blocks={blocks} onChange={setBlocks} posts={posts} />
            </div>

            {/* Preview */}
            {showPreview && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleSave} disabled={saving} className={btnPrimary}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button onClick={() => setShowPreview(!showPreview)} className={btnSecondary}>
                {showPreview ? 'Vorschau schliessen' : 'Vorschau'}
              </button>
              <button onClick={handleTest} disabled={testing} className={btnSecondary}>
                {testing ? 'Senden…' : 'Testmail'}
              </button>
              {step.id > 0 && (
                <button
                  onClick={() => onDelete(step.id)}
                  className="rounded-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Löschen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main Component ----------------------------------------------------

export default function AutomationEditor({ posts, siteConfig }: { posts: Post[]; siteConfig: SiteConfig }) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [automation, setAutomation] = useState<Automation | null>(null)
  const [editName, setEditName] = useState('')
  const [editTrigger, setEditTrigger] = useState('subscriber_confirmed')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [showEnrollments, setShowEnrollments] = useState(false)
  const [stepStats, setStepStats] = useState<StepStats[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Load list
  useEffect(() => {
    loadList()
  }, [])

  const loadList = async () => {
    setLoading(true)
    const data = await api('GET', { list: '1' })
    setAutomations(data)
    setLoading(false)
  }

  // Load single automation
  const loadAutomation = async (id: number) => {
    const data = await api('GET', { id: String(id) })
    setAutomation(data.automation)
    setSteps(data.steps)
    setEditName(data.automation.name)
    setEditTrigger(data.automation.trigger_type)
    setSelectedId(id)

    const stats = await api('GET', { stats: String(id) })
    setStepStats(stats)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const { id } = await api('POST', { action: 'create', name: newName, trigger_type: 'subscriber_confirmed' })
    setCreating(false)
    setNewName('')
    await loadList()
    await loadAutomation(id)
  }

  const handleUpdateAutomation = async () => {
    if (!automation) return
    await api('POST', { action: 'update', id: automation.id, name: editName, trigger_type: editTrigger })
    showToast('Gespeichert')
    loadList()
  }

  const handleToggleActive = async () => {
    if (!automation) return
    const newActive = automation.active ? 0 : 1
    await api('POST', { action: 'toggle-active', id: automation.id, active: newActive })
    setAutomation({ ...automation, active: newActive })
    showToast(newActive ? 'Aktiviert' : 'Deaktiviert')
    loadList()
  }

  const handleDeleteAutomation = async () => {
    if (!automation || !confirm(`"${automation.name}" wirklich löschen?`)) return
    await api('POST', { action: 'delete', id: automation.id })
    setSelectedId(null)
    setAutomation(null)
    loadList()
  }

  const handleSaveStep = async (step: Step) => {
    const { id } = await api('POST', {
      action: 'save-step',
      step_id: step.id || undefined,
      automation_id: selectedId,
      step_order: step.step_order,
      delay_hours: step.delay_hours,
      subject: step.subject,
      blocks_json: step.blocks_json,
    })
    showToast('Schritt gespeichert')
    await loadAutomation(selectedId!)
  }

  const handleDeleteStep = async (stepId: number) => {
    if (!confirm('Schritt wirklich löschen?')) return
    await api('POST', { action: 'delete-step', step_id: stepId })
    showToast('Schritt gelöscht')
    await loadAutomation(selectedId!)
  }

  const handleTestStep = async (step: Step) => {
    const blocks: NewsletterBlock[] = JSON.parse(step.blocks_json)
    const postsMap = buildPostsMap(blocks, posts)
    await api('POST', {
      action: 'test-step',
      subject: step.subject,
      blocks_json: step.blocks_json,
      posts_map: postsMap,
    })
    showToast('Testmail gesendet')
  }

  const addStep = () => {
    const nextOrder = steps.length
    const newStep: Step = {
      id: 0,
      automation_id: selectedId!,
      step_order: nextOrder,
      delay_hours: nextOrder === 0 ? 0 : (steps[steps.length - 1]?.delay_hours ?? 0) + 24,
      subject: '',
      blocks_json: '[]',
    }
    setSteps([...steps, newStep])
  }

  const loadEnrollments = async () => {
    if (!selectedId) return
    const data = await api('GET', { enrollments: String(selectedId) })
    setEnrollments(data)
    setShowEnrollments(true)
  }

  // --- List View -----------------------------------------------------

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Automatisierungen</h3>
          <button onClick={() => setCreating(true)} className={btnPrimary}>
            Neue Automatisierung
          </button>
        </div>

        {creating && (
          <div className="glass-card flex gap-3 rounded-2xl p-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name der Automatisierung…"
              className={inputCls + ' flex-1'}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button onClick={handleCreate} className={btnPrimary}>Erstellen</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className={btnSecondary}>Abbrechen</button>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-[var(--text-secondary)]">Laden…</div>
        ) : automations.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center text-[var(--text-secondary)]">
            Noch keine Automatisierungen erstellt.
          </div>
        ) : (
          <div className="grid gap-3">
            {automations.map((a) => (
              <button
                key={a.id}
                onClick={() => loadAutomation(a.id)}
                className="glass-card flex items-center gap-4 rounded-2xl p-5 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex-1">
                  <div className="font-medium text-[var(--text)]">{a.name}</div>
                  <div className="mt-1 flex gap-3 text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                      {triggerLabels[a.trigger_type] || a.trigger_type}
                    </span>
                    <span>{a.step_count} Schritt{a.step_count !== 1 ? 'e' : ''}</span>
                    <span>{a.enrollment_count} Enrollment{a.enrollment_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className={`h-3 w-3 rounded-full ${a.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              </button>
            ))}
          </div>
        )}

        {toast && (
          <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none">
            <div className="pointer-events-auto rounded-2xl border border-emerald-200/60 bg-emerald-50/90 px-5 py-3 text-sm font-medium text-emerald-800 shadow-xl backdrop-blur-md dark:border-emerald-700/60 dark:bg-emerald-900/80 dark:text-emerald-200">
              {toast}
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- Editor View ----------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setSelectedId(null); setAutomation(null); loadList() }}
          className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleUpdateAutomation}
            className="border-none bg-transparent text-lg font-semibold text-[var(--text)] outline-none focus:ring-0"
          />
        </div>
        <button
          onClick={handleToggleActive}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            automation?.active
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {automation?.active ? 'Aktiv' : 'Inaktiv'}
        </button>
      </div>

      {/* Trigger */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-[var(--text-secondary)]">Trigger:</label>
          <select
            value={editTrigger}
            onChange={(e) => { setEditTrigger(e.target.value); handleUpdateAutomation() }}
            className={inputCls + ' max-w-xs'}
          >
            <option value="subscriber_confirmed">Nach Bestätigung (Double-Opt-In)</option>
          </select>
          <button onClick={handleDeleteAutomation} className="ml-auto text-sm text-red-500 hover:text-red-700">
            Löschen
          </button>
        </div>
      </div>

      {/* Steps Timeline */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-[var(--text-secondary)]">E-Mail-Sequenz</h4>
        {steps.map((step, i) => {
          const stats = stepStats.find((s) => s.step_id === step.id)
          return (
            <div key={step.id || `new-${i}`}>
              <StepEditor
                step={step}
                index={i}
                posts={posts}
                siteConfig={siteConfig}
                onSave={handleSaveStep}
                onDelete={handleDeleteStep}
                onTest={handleTestStep}
              />
              {stats && stats.total_sent > 0 && (
                <div className="ml-16 mt-1 flex gap-3 text-xs text-[var(--text-secondary)]">
                  <span>{stats.total_sent} gesendet</span>
                  <span>{stats.delivered} zugestellt</span>
                  <span>{stats.opened} geöffnet</span>
                  <span>{stats.clicked} geklickt</span>
                  {stats.bounced > 0 && <span className="text-red-500">{stats.bounced} bounced</span>}
                </div>
              )}
            </div>
          )
        })}

        <button onClick={addStep} className={btnSecondary + ' ml-14'}>
          + Schritt hinzufügen
        </button>
      </div>

      {/* Enrollments */}
      <div className="glass-card rounded-2xl p-4">
        <button
          onClick={showEnrollments ? () => setShowEnrollments(false) : loadEnrollments}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-[var(--text)]">
            Enrollments
          </span>
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${showEnrollments ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showEnrollments && (
          <div className="mt-4">
            {enrollments.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Noch keine Enrollments.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-[var(--text-secondary)] dark:border-slate-700">
                      <th className="pb-2">E-Mail</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Eingeschrieben</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 text-[var(--text)]">{e.subscriber_email}</td>
                        <td className="py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            e.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : e.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {e.status === 'active' ? 'Aktiv' : e.status === 'completed' ? 'Abgeschlossen' : 'Abgebrochen'}
                          </span>
                        </td>
                        <td className="py-2 text-[var(--text-secondary)]">{formatDate(e.enrolled_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none">
          <div className="pointer-events-auto rounded-2xl border border-emerald-200/60 bg-emerald-50/90 px-5 py-3 text-sm font-medium text-emerald-800 shadow-xl backdrop-blur-md dark:border-emerald-700/60 dark:bg-emerald-900/80 dark:text-emerald-200">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
